# Context Hub and Context Engineering in LangSmith

The Context Hub is [LangSmith](../systems/langsmith.md)'s versioned store for agent *context* — the instructions, skills, and reference material an agent relies on to act. Its governing idea is stated plainly in the docs: "Context Hub brings the same discipline to agent instructions that Git brings to code." That analogy is not decorative; commits, immutability, diffing, reverting, tagging, and environment promotion are all present, and they are what make agent instructions a governable artifact rather than a string in a source file.

The motivating claim is that agents behave inconsistently in production when their context is poorly managed, so *context engineering* — building and optimizing that context — is treated as a first-class practice rather than prompt tweaking. This page covers the Hub's repo model, its versioning semantics, and the boundary it draws against runtime state.

## Two repo types: skills and agents

A **skill** is a versioned repo packaging a reusable capability, typically a root `SKILL.md` with instructions and usage guidance plus optional references, templates, and schemas. Email formatting, code review, and web research are the given examples.

An **agent repo** packages one agent's configuration: an `AGENTS.md` holding the system prompt and operating instructions, optionally `tools.json`, and linked `agents/*` or `skills/*` entries.

The distinction the docs draw is about reuse direction. Skills are *reusable context modules* shared across agents; agent repos are *top-level bundles* defining how one agent operates. The practical heuristic given is the one worth remembering: if you find yourself copying the same block of context into several agents, extract it into a skill repo and reference it from each.

## Linked repos and propagation

Context Hub commits support three entry types in `files`: `file` (inline content), `agent` (a link to another agent repo), and `skill` (a link to a skill repo). When a linked repo receives a new commit, **LangSmith propagates that update to parent repos that reference it**.

This is the feature that makes the Git analogy more than superficial — it is closer to a package manager than to a monorepo. A shared policy or workflow lives in one place and updates flow outward to every agent depending on it, which is exactly the property that makes context maintainable across a fleet of agents but also means a careless commit to a widely-linked skill has broad blast radius.

## Versioning and environments

Every change creates a new commit. Commits are immutable, browsable, and comparable, supporting four operations: seeing exactly what changed between two versions of an agent; reverting when a change regresses behaviour; tagging important commits for reference; and **promoting a commit to an environment** such as `Staging` or `Production` so downstream agents pull a stable version rather than the latest edit.

That last one carries the most operational weight. Without environment promotion, every agent consuming a shared skill is effectively pinned to `HEAD` and inherits edits the moment they land. With it, instruction changes acquire a release process. Paired with [evaluation](langsmith-evaluation.md), it closes a loop: change instructions, evaluate the change, promote if it improves.

## Context Hub versus a store backend

The docs are careful to distinguish two backends that both hold context, noting most agents use both:

| | Context Hub | Store backend |
|---|---|---|
| Holds | Long-term *authored* context | Runtime *accumulated* state |
| Contents | Instructions, skills, policies, examples | Memories, conversation history, user preferences, learned facts |
| Change model | Commits — versioned, reviewable, promotable | Continuous, per-session or per-user |
| Authored by | Developers | The agent, while running |

The line is **who writes it and whether the change is reviewable**. Authored context belongs in the Hub where it can be versioned; accumulated state belongs in a [store backend](deepagents-backends.md) where it evolves freely.

[Managed Deep Agents](../systems/managed-deep-agents.md) implements exactly this split at the filesystem level, and its layout is the clearest illustration of the principle: `/instructions.md` and `/skills/**` are synced from the project on every deploy and are **read-only** to the agent, while `/memories/user/**` is agent-writable and deliberately **never overwritten** by a deploy. Developer-owned context flows one way, runtime-owned memory flows the other, and neither clobbers the other.

That separation is precisely what is missing in [`dcode`](../systems/deep-agents-code.md), where a single `AGENTS.md` serves as both developer-authored project configuration *and* an agent-writable memory file — the shared-ownership problem recorded on that page. The Context Hub model shows the resolved version of the same design tension, which suggests the CLI's conflation is a local simplification rather than the ecosystem's considered position.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/langsmith/context-engineering-concepts |
| 2026-07-25 | https://docs.langchain.com/langsmith/managed-deep-agents-memory — the Hub layout as implemented by the managed runtime |

*Scope note: this page is built from the context-engineering concepts source and the managed-runtime memory docs. The `langsmith/use-the-context-hub` how-to (repo creation, SDK access, webhooks) has not been ingested, so operational specifics are absent by omission rather than because they do not exist.*
