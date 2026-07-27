# Context Engineering in Deep Agents

Context engineering is the practice of providing the right information and tools, in the right format, so an agent can work reliably. In [Deep Agents](../systems/deep-agents.md) it is not an add-on but the organizing principle of the harness: the docs sort every context source into five kinds and ship built-in machinery for the ones that would otherwise overflow. This page catalogues those mechanisms. The cross-cutting argument about *why* so many subsystems turn out to be context management in disguise lives in the [context economics synthesis](../syntheses/context-economics.md).

| Kind | What you control | Scope |
|---|---|---|
| **Input context** | What enters the prompt at startup — system prompt, memory, skills, tool prompts | Static, applied each run |
| **Runtime context** | Configuration passed at invoke time — user metadata, keys, connections | Per run, propagates to subagents |
| **Context compression** | Built-in offloading and summarization | Automatic, near limits |
| **Context isolation** | Subagents quarantining heavy work | Per delegated task |
| **Long-term memory** | Persistent storage across threads | Across conversations |

## Input context and prompt assembly

The assembled system message has a documented nine-part order, which is worth recording because it makes the harness's layering legible: (1) the caller's custom `system_prompt`, (2) the base agent prompt, (3) the to-do list prompt, (4) the memory prompt with `AGENTS.md` and usage guidelines (only when memory is configured), (5) the skills prompt listing skill locations and frontmatter (only when skills are configured), (6) the virtual filesystem prompt including `execute` docs where applicable, (7) the subagent/`task` prompt, (8) user-supplied middleware prompts, and (9) the human-in-the-loop prompt when `interrupt_on` is set.

The design principle running through parts 4–7 is that **capabilities carry their own instructions**. Adding filesystem [middleware](langchain-middleware.md) does not just add tools; it appends documentation teaching the model to use them. This is why the [customization](deepagents-customization.md) page's middleware stack and the prompt are the same subject viewed from two angles.

The distinction between memory and skills is the sharpest instance of a general principle:

- **Memory (`AGENTS.md`) is always injected.** The guidance follows directly: keep it minimal, reserved for always-relevant conventions, because every token is re-sent on every turn. (Files it *references* are a different matter — see below.)
- **Skills are on-demand.** Only `SKILL.md` frontmatter (name and description) is read at startup; the full body loads only when the agent judges the skill relevant. Keep each skill focused on one workflow, keep its main content concise, and move detailed reference material into separate files it links to.

That is **progressive disclosure** as an explicit context-budget strategy, and it is what lets an agent have access to far more instruction than it could ever hold at once.

### Progressive disclosure is a pattern, not a feature

Skills are the most *formalized* instance, but they are not the only one — the memory page is explicit that the agent "can load memory files into the system prompt at startup, **or read them on demand** during the conversation," and offers skills merely as an example of the latter. The same shape recurs at every level of the harness:

| Instance | Always in context | Loaded on demand |
|---|---|---|
| Skills | `SKILL.md` frontmatter (name, description) | The `SKILL.md` body |
| Skill supporting files | References written into the skill body | `scripts/`, `references/`, `assets/` |
| Offloading | File path plus a 10-line preview | The offloaded result, via `read_file`/`grep` |
| Summarization | The structured summary | The filesystem-preserved transcript |
| Hot/cold memory | `/memories/user/AGENTS.md` | Cold files under the slice |
| Extra memory files | A reference inside `AGENTS.md` | The referenced file |

The common formula is **(a) something always in context that names what exists and signals when to want it, plus (b) a retrieval affordance**. Skills standardize (a) as YAML frontmatter and give it discovery and precedence rules; every other instance improvises (a) as prose pointers. That is a reliability difference rather than a capability one — a frontmatter list is structurally enumerated, whereas a prose pointer only works if the model chooses to follow it — and it explains why skills exist as a formalized layer over a pattern the filesystem already permits.

The docs' own skill example demonstrates the pattern operating with no skills machinery at all: the `langgraph-docs` skill instructs the agent to fetch `llms.txt`, a documentation *index*, then select two to four relevant pages from it. Index plus fetch tool, one level further out. And because `memory=` takes a *list of file paths*, which files are always-injected is itself a configuration choice — so memory and skills sit on a spectrum rather than in two boxes.

## Runtime context and custom state

Runtime context is per-run configuration passed via `context` and shaped by `context_schema`. Critically, **it is not automatically included in the prompt** — the model sees it only if a tool or middleware reads it and adds it. Tools read it from the injected `ToolRuntime`. It **propagates to all subagents**, so a delegated task inherits the parent's run configuration.

Where runtime context is immutable per-run input, a **custom state schema** (`deepagents>=0.6.6`) covers mutable data that must survive the full lifecycle and be checkpointed: counters, flags, accumulated values, data shared between tools and middleware, and cross-cutting concerns like usage tracking. Custom schemas must subclass `DeepAgentState`, and the reason is a performance one worth noting — this preserves the built-in `DeltaChannel` reducer on `messages`, **which keeps checkpoint growth linear as conversations get longer**. Declarative subagent specs inherit the parent `state_schema`; already-compiled or remote subagents do not.

## Compression: offloading and summarization

Every `create_deep_agent` call includes compression — no middleware required. Two mechanisms operate at different thresholds.

**Offloading** triggers when tool call inputs or results exceed a token threshold (default 20,000). For large *inputs*, file writes and edits leave full file content in the conversation history, which is redundant since the content is already on the filesystem; as the session crosses 85% of the model's window, older tool calls are truncated and replaced with a pointer to the file. For large *results*, the response is written to the configured [backend](deepagents-backends.md) and substituted with a file path plus a preview of the first ten lines, which the agent can re-read or `grep` as needed.

**Summarization** runs when context crosses the model's limit and nothing more is eligible for offloading. Its structure is the detail worth carrying away — it is deliberately **dual**:

- An **in-context summary**, LLM-generated and structured around session intent, artifacts created, and next steps, replaces the full history in working memory.
- A **filesystem preservation** step writes a text rendering of the original messages as a canonical record.

So the agent keeps awareness of goals and progress through the summary while retaining the ability to recover details through filesystem search. Compression is lossy in the window but **not lossy in the system**.

Configuration: triggers at 85% of `max_input_tokens` from the [model profile](../components/langchain-models.md), keeps 10% of tokens as recent context, and falls back to a 170,000-token trigger keeping 6 messages when no profile is available. If any model call raises `ContextOverflowError`, the agent immediately falls back to summarization and retries. Summarization tokens appear in the stream and can be filtered by checking `metadata["lc_source"] == "summarization"`.

Because the trigger is a fraction of the profile's `max_input_tokens`, **lowering that value via a profile override deliberately forces compression to fire early** — the documented technique for testing compression behaviour without generating a real 200k-token conversation.

An opt-in `compact_conversation` tool (via `create_summarization_tool_middleware`) lets the agent compact *on demand* — between tasks, say — rather than waiting for the threshold. Adding it does not disable automatic summarization; both share one engine and state.

## Isolation and long-term memory

Subagents solve the **context bloat problem**: the main agent receives a subagent's final report rather than the dozens of tool calls that produced it. The best practices are blunt about the failure mode — instruct subagents to return summaries, not raw data ("Return only the essential summary (under 500 words). Do NOT include raw search results"), and have them write large outputs to files the main agent reads selectively. The [delegation](deepagents-delegation.md) page covers the mechanics.

Long-term memory requires routing a path such as `/memories/` through a `CompositeBackend` to a Store. The docs stress that the path need not be pre-populated: you supply the backend, store, and *instructions telling the agent what to save and where*, and the agent creates files on demand. Memory is therefore a prompt contract as much as a storage configuration — which is exactly why [Managed Deep Agents](../systems/managed-deep-agents.md) seeds a guidance block into a new slice's `AGENTS.md` and warns against deleting it.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/context-engineering |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/skills |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/memory |
