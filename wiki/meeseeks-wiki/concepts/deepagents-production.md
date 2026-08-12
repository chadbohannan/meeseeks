# Taking a Deep Agent to Production

This page covers what changes when a [Deep Agent](../systems/deep-agents.md) moves from a local prototype to a deployment serving many users: the three scoping primitives, multi-tenancy and authentication, credential handling, durability, memory scoping, sandbox lifecycle, and the fault-tolerance middleware catalogue. It is the operational counterpart to the [backends](deepagents-backends.md) and [delegation](deepagents-delegation.md) pages.

## Three primitives that determine sharing

Everything about production scoping reduces to how information is shared across three boundaries:

- **Thread** — a single conversation. Message history and scratch files are thread-scoped by default and do not carry over.
- **User** — someone interacting with the agent. Memory and files can be private or shared; identity comes from the auth layer.
- **Assistant** — a configured agent instance. Memory and files can be tied to one assistant or shared across all of them.

Almost every production decision is a choice about which of these three a piece of state hangs off.

## Invocation: `thread_id` and `context`

Every production invocation carries two run-level parameters, and the docs are careful that they are independent. **`thread_id`** (via `config={"configurable": {"thread_id": ...}}`) identifies the conversation; the checkpointer uses it to persist and resume message history, and a new one starts a fresh conversation. **`context`** carries per-run data that tools and middleware read at invocation time — `user_id`, API keys, feature flags, session metadata — with its shape declared by `context_schema` and read via `runtime.context`. Changing one does not affect the other. Notably, `context` **propagates to subagents**, which makes it the channel for per-run configuration in a delegated workflow.

Deployment configuration lives in `langgraph.json` at the project root, required for both `langgraph dev` and production: `dependencies` (packages to install; `["."]` installs the current directory), `graphs` (mapping graph IDs to `"./file.py:variable"` locations), and `env` (path to a `.env` file baked in at build time).

## Multi-tenancy and authentication

Three distinct layers compose, and conflating them is the common mistake:

1. **End-user identity and access control.** LangSmith Deployments supports custom authentication plus authorization handlers that run after authentication and can tag resources with ownership metadata, return filters so users see only their own resources, or deny with HTTP 403.
2. **Team RBAC.** Separate from end-user authorization, governing who on your team can deploy, configure, and monitor agents — Workspace Admin (full, including member management), Editor (create and modify, but cannot delete runs or manage members), Viewer (read-only), with custom granular roles on Enterprise.
3. **End-user credentials**, for when the agent acts on a user's behalf against external APIs.

That third layer has three documented mechanisms. **Agent Auth** provides managed OAuth 2.0: on first use the agent *interrupts* execution and presents a consent URL, then resumes with a valid token once the user authenticates, with tokens stored and refreshed automatically — a neat reuse of the [interrupt](human-in-the-loop.md) primitive for something other than approval. A **sandbox auth proxy** injects credentials into outbound requests from sandboxed code so that code never receives raw API keys. And **workspace secrets** hold keys shared across all users, such as an organization's LLM provider keys.

## Durability

Deep Agents inherit LangGraph's [durable execution](langgraph-durable-execution.md): state is checkpointed at each step, so a run interrupted by failure, timeout, or a human-in-the-loop pause resumes from its last recorded state without reprocessing. The docs make the point that matters for delegation-heavy work — for long-running agents that spawn many subagents, **a mid-run failure does not lose completed work**. Checkpointing also underwrites indefinite interrupts (pausing for minutes or days), time travel (every checkpointed step is a rewindable snapshot), and an audit trail for irreversible operations such as payments. LangSmith Deployments configure a persistent checkpointer automatically.

## Memory scoping

Memory in Deep Agents is not a separate subsystem: it is files in the virtual filesystem, made cross-thread by routing a path such as `/memories/` to a `StoreBackend` inside a `CompositeBackend`. The scope is then chosen by the [namespace factory](deepagents-backends.md) — as a concrete `namespace=` argument on `StoreBackend` since v0.7.0 removed the older factory-callable construction pattern:

| Scope | Namespace | Use case |
|-------|-----------|----------|
| **User** (recommended default) | `(user_id)` | Per-user preferences and context |
| **Assistant** | `(assistant_id)` | Shared instructions for one assistant |
| **Global** | `(org_id)` | Read-only policies across all users and assistants |

The security warning attached to this is the sharpest one in the production docs, and it generalizes well beyond Deep Agents: **shared memory is a vector for prompt injection.** If one user can write to memory that another user's conversation reads, a malicious user can inject instructions into shared state. The mitigation is to enforce read-only access where appropriate — organization-wide policies should be writable only through application code, not by the agent — using declarative [permissions](deepagents-backends.md) to deny writes to shared paths, or backend policy hooks for custom validation. This is the same threat model the [guardrails](langchain-guardrails.md) page treats as layered defense, applied to persistent state rather than to message content.

## Execution environment

The choice is binary: if the agent only reads and writes files, a filesystem backend suffices; if it needs to run code or install packages, it needs a sandbox. `FilesystemBackend` and `LocalShellBackend` access the host directly and the docs state flatly that they must not be used in deployed agents. `StateBackend` is checkpointed at every step, so large files should not be written to it.

Sandbox **lifecycle** is the key decision, and it maps onto the three primitives: thread-scoped sandboxes (ID stored on thread metadata, fresh per conversation, cleaned up on TTL) suit work like data analysis where each conversation should start clean; assistant-scoped sandboxes (ID on assistant config) are shared across all conversations, giving a persistent environment. Isolation also protects the host — if agent code exhausts memory or crashes, only the sandbox dies.

## Fault tolerance

Rather than one retry mechanism, Deep Agents sorts errors by *who can fix them*, which is a better organizing principle than severity:

| Error type | Who fixes it | Strategy | Mechanism |
|---|---|---|---|
| Transient (network, rate limits) | System | Retry with exponential backoff | `ModelRetryMiddleware`, `ToolRetryMiddleware` |
| LLM-recoverable (tool failure, parse error) | LLM | Convert to an error `ToolMessage` and let the model adjust | `ToolErrorMiddleware` (needs `langchain>=1.3.14`) |
| User-fixable (missing info, unclear instructions) | Human | Pause with `interrupt()` | [Human-in-the-loop](human-in-the-loop.md) |
| Provider outage | System | Fall back to another model | `ModelFallbackMiddleware` |
| Runaway loops | System | Cap model and tool calls per run | `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware` |
| Unexpected | Developer | Let it bubble up | No middleware |

Two things stand out. The **LLM-recoverable** row is the one without an analogue in conventional software fault tolerance: the model is treated as a component capable of recovering from an error if the error is described to it, so the fix is to convert an exception into a message rather than to retry or abort. And every strategy is delivered as [middleware](langchain-middleware.md), which is how the framework keeps resilience composable and out of the agent definition. This is the Deep-Agents-level view of the step-level mechanisms on the [LangGraph fault tolerance](langgraph-fault-tolerance.md) page.

## Async as a production requirement

Because LLM applications are heavily I/O-bound, the docs treat async as a production concern rather than a style preference: prefer natively async tools (LangChain runs sync tools in a separate thread, which works but adds threading overhead), implement async middleware hooks (`abefore_agent` rather than `before_agent`), and await external resource lifecycles — which is *why* graph factories that provision sandboxes or connect to [MCP](langchain-mcp.md) servers are async. LangChain's convention is an `a` prefix, with sync and async variants living in the same class.

## The deployment ladder

The docs present three rungs. [Managed Deep Agents](../systems/managed-deep-agents.md) is the recommended path — a CLI-first hosted runtime, currently private preview. A direct [LangSmith Deployment](../components/langgraph-agent-server.md) suits teams needing custom application code, custom routes, or advanced authentication, and provisions threads, runs, a store, and a checkpointer while adding authentication, webhooks, cron, observability, and optional MCP or A2A exposure. Self-hosting the OSS harness leaves everything, including persistence, to the operator.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/going-to-production |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/fault-tolerance |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/context-engineering |
