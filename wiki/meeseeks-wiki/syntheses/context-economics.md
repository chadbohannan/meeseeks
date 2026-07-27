# Two Attention Economies: Agent Context and Human Focus

The [attention-economics synthesis](attention-economics.md) argues that attention is Meeseeks' scarce resource and that the product's job is to manufacture it rather than spend it. Ingesting the Deep Agents context-engineering surface surfaces a structural rhyme: **[Deep Agents](../systems/deep-agents.md) is, almost in its entirety, an attention-management system too** — only the scarce resource is the model's context window rather than the human's focus.

This page makes that claim precise, shows that both systems reach for the same four moves, and then argues that the interesting content is in the two places where the analogy *breaks*, because those are where Deep Agents has solved a problem Meeseeks has not, and where copying it would be a mistake.

## Almost every Deep Agents subsystem is context management

Read the harness feature-first and it looks like a grab bag: a filesystem, subagents, skills, memory, an interpreter, middleware. Read it budget-first and it collapses into one discipline. Each subsystem answers the question *how do we keep the working set small without losing the information?*

| Subsystem | Context move |
|---|---|
| [Offloading](../concepts/deepagents-context-engineering.md) | Results over 20k tokens become a file path plus a 10-line preview |
| Summarization | At 85% of the window, history becomes a structured summary |
| [Subagents](../concepts/deepagents-delegation.md) | Heavy work runs in a fresh window; only the report returns |
| Skills | Frontmatter at startup, body only on match — progressive disclosure |
| Memory (`AGENTS.md`) | The deliberate opposite: always injected, therefore kept minimal |
| [Interpreters](../concepts/deepagents-interpreters.md) | Loops and intermediate values never enter the context at all |
| [Backends](../concepts/deepagents-backends.md) | The durable substrate everything above offloads *into* |
| [Hot/cold memory](../systems/managed-deep-agents.md) | Hot injected every turn; cold read on demand |
| `async_tasks` state channel | Handles to outstanding work kept outside the compressible channel |
| [Harness profiles](../concepts/deepagents-customization.md) | Per-model prompt and tool-surface shaping |

The filesystem is the giveaway. It is presented as a capability — the agent can read and write files — but its structural role is to be *the place context goes when it leaves the window*. Offloaded tool results, preserved conversation history, long-term memories, and subagent work products all land there. The virtual filesystem is not a feature the agent uses; it is the backing store of the attention economy.

## The four moves, in both systems

Meeseeks manages a human's focus across concurrent agents; Deep Agents manages a model's window across a long task. Both make the same four moves.

**Offload.** Deep Agents replaces a large tool result with a pointer. Meeseeks' [dismiss-without-kill](../components/console.md) removes a console panel from view while the agent keeps running — the work continues, the reference remains, the attention is reclaimed.

**Summarize.** Deep Agents compacts history into session intent, artifacts, and next steps. Meeseeks compresses a running agent into a status dot, and the [tracing runbook](../runbooks/tracing-meeseeks-sessions-to-langsmith.md) would compress it further into trace metrics.

**Isolate.** A subagent gets a fresh window so its tool calls never touch the parent's. A Meeseeks console panel gets one ticket so its output never touches another's.

**Persist outside the working set.** Files and `/memories/` outlive the window; durable threads would outlive the session.

The convergence is not coincidence. Both are systems where a fixed-size working set faces an unbounded stream of potentially relevant information, and there are only so many ways to respond to that.

## Where the analogy pays off

Two Deep Agents mechanisms answer open problems in the Meeseeks design record, and they transfer.

**Compression should be lossy in the view, not in the system.** Deep Agents' summarization is deliberately *dual*: an LLM summary replaces history in the working window **and** a text rendering of the original messages is written to the filesystem as a canonical record. The agent keeps orientation through the summary and can recover detail through search. Meeseeks' [ring buffer](../components/runtime.md) does the first half of this and not the second — a 2 MB circular buffer with a `droppedBytes` counter, discarding bytes with no canonical record anywhere. The attention-economics page already identifies this as the product having a memory shorter than its own workflows; Deep Agents supplies the resolution and it is architectural rather than a matter of buffer size. **The console panel should be a view over a durable log, not the log itself.** Once that inversion is made, the buffer's size stops being a correctness question and becomes a rendering-performance question.

**Handles to outstanding work must live outside the compressible channel.** Deep Agents stores async task metadata in a dedicated `async_tasks` state channel explicitly because message history gets compacted, and task IDs living only in tool messages would be destroyed by summarization. Generalized: *any system with a compressed working set needs a separate, uncompressed channel for references to work in flight.* Meeseeks satisfies this today — the `runtimes` Map is separate from the ring buffer — but incidentally rather than by principle, and both are volatile. Stated as a principle it becomes a durability requirement with a priority: **the registry of running agents must be persisted before the scrollback is**, because losing the transcript costs history while losing the registry costs the work itself.

## Where the analogy breaks — and why copying would be wrong

Here the two economies diverge, and the divergence is not a detail.

**Retrieval cost is asymmetric.** When a Deep Agent evicts something, recovering it costs a `read_file` — tokens and a little latency. When Meeseeks evicts something from a human's attention, recovering it costs a context switch measured in minutes, and often the human simply never comes back. Eviction is cheap for the agent precisely because *retrieval* is cheap; the 85% threshold and the aggressive 20k offload rule are rational under that cost structure.

The conclusion for Meeseeks runs the other way. Under expensive retrieval, the correct policy is to **discard less and rank more**. Aggressive summarization of what an agent is doing is the wrong lever if the human then has to reconstruct the situation by hand. What the human needs is not a smaller working set but a *better-ordered* one — which is exactly the doorbell-to-priority-queue argument the attention-economics page already makes, now with a reason behind it rather than an intuition. Deep Agents optimizes for a small window; Meeseeks should optimize for correct ordering within a window that is already small and cannot be enlarged.

**Progressive disclosure has no Meeseeks analog, and the fix is cheaper than it looks.** This is the one place the borrowing runs cleanly in the other direction. Meeseeks operates in always-injected mode only: the runtime adapter reads board `CONTEXT.md` and lane `PROCESS.md` and prepends both to every session's preamble unconditionally, so a `PROCESS.md` that matters for three ticket types out of ten pays rent on every session in that lane.

It would be easy to conclude that closing this gap means building a skills subsystem. It does not. As the [context-engineering](../concepts/deepagents-context-engineering.md) page details, progressive disclosure in Deep Agents is a *pattern* with many instances — skills, offloaded results, preserved transcripts, cold memory, referenced extra files — and all of them reduce to the same two ingredients: **something always in context that names what exists and signals when to want it, plus a retrieval affordance.** Skills are simply the instance where the index layer is standardized as YAML frontmatter with discovery and precedence rules.

Meeseeks already has the second ingredient, and rather more than that. A supervised Claude Code session has `Read`, `Grep`, and `Glob` over the board directory — but the 2026-07-25 review of [Claude Code's capability surface](../systems/claude-code.md#capability-surface) found it also ships a full skills system implementing the same [Agent Skills](https://agentskills.io) standard Deep Agents uses, with a documented progressive-disclosure property ("a skill's body loads only when it's used") and a `paths` frontmatter field that gates auto-activation on glob patterns. So the harness Meeseeks supervises *today* supports conditional progressive disclosure natively; a lane's situational workflow could live in `.claude/skills/` and load only when the ticket touches matching files. What is missing is only the first ingredient: `CONTEXT.md` is written as content rather than as an index, and nothing in the board layout is expressed as a skill. Restructuring it to name its sibling documents and say when each is relevant — "`PROCESS.md` covers the release workflow; read it when the ticket touches deployment" — buys progressive disclosure with no new subsystem and no harness change. The honest caveat is the reliability difference the docs imply: a prose pointer works only if the model follows it, whereas frontmatter is structurally enumerated into the prompt. That is the argument for eventually formalizing the index layer, and `dcode`'s `--skill` flag and `SKILL.md` discovery are the precedent — but it is a refinement of a cheap fix, not a prerequisite for it.

**Budgets should be explicit and tunable.** Deep Agents' thresholds are all named, documented, and adjustable: 20k offload, 85% summarize, 10% retained, 170k fallback, `max_input_tokens` from a model profile. Critically, lowering `max_input_tokens` through a profile override is the *documented technique for testing compression early*, without generating a real 200k-token conversation. Meeseeks' 2 MB ring buffer is a single hardcoded number with no equivalent affordance — you cannot ask the system to behave as though it were nearly full. Whatever replaces it should keep the property that the pressure threshold is configurable, because that is what makes the eviction path testable at all.

## The synthesis in one line

Deep Agents and Meeseeks are the same kind of system pointed at different scarce resources, and the shared vocabulary — offload, summarize, isolate, persist — is worth adopting deliberately. But the cost of retrieval differs by orders of magnitude between a model re-reading a file and a human re-entering a task, and that single asymmetry inverts the policy. Deep Agents should evict aggressively because it can always fetch again. Meeseeks should evict reluctantly, rank ruthlessly, and never discard anything it cannot reconstruct. The mechanisms transfer; the thresholds must not.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/context-engineering |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/async-subagents — the `async_tasks` channel rationale |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/profiles |
| 2026-07-16 | Design discussion — attention economics (the human-side counterpart) |
| 2026-07-11 | `src/runtime/ring-buffer.ts` (2 MB circular buffer, `droppedBytes`), `src/runtime/supervisor.ts` (volatile `runtimes` Map) |
