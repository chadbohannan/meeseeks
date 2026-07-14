# Supervised CLI vs. Framework/Server: Two Harness Paradigms for Meeseeks

Meeseeks has evaluated three agentic harnesses — [Claude Code](../systems/claude-code.md) (its current dependency), [Pi](../systems/pi.md), and the [LangChain ecosystem](../systems/langchain-ecosystem.md) — across four syntheses. This page is the capstone over them. Its claim is that the real decision facing Meeseeks is not *which of three harnesses* but *which of two paradigms*, because Claude Code and Pi, for all their differences, belong to the same one. The choice between those paradigms is the single most consequential architectural fork in the project, because it determines what the [Runtime Supervisor](../components/runtime.md) — and therefore Meeseeks itself — fundamentally *is*.

## The two paradigms

**The supervised-CLI paradigm.** The harness is an external process the orchestrator spawns and drives over stdio. The orchestrator owns the process lifecycle, reverse-engineers the agent's state from whatever the process emits, and renders output from raw bytes or a structured event stream. Claude Code and Pi are both this. Meeseeks, in this paradigm, is a **process supervisor**.

**The framework/server paradigm.** The harness is not a process but a *runtime*: an agent is a graph object you embed, or a service you become an HTTP client of. The runtime owns durability, state, and often rendering; the orchestrator declares configuration and consumes structured results. LangChain (via embedding or the [Agent Server](../components/langgraph-agent-server.md)) is this. Meeseeks, in this paradigm, is an **API client or embedder**.

## Why Claude Code and Pi are one paradigm

The [Claude Code vs. Pi comparison](claude-vs-pi-runtime-interfaces.md) catalogues real, large differences between the two — Claude Code is a compiled binary on a PTY whose state Meeseeks scrapes through injected `Stop`/`Notification` `curl` hooks and a startup debounce (see [state detection](../concepts/claude-code-state-detection.md)); Pi is a Node process with four modes, a 30-command RPC protocol, in-process JavaScript hooks with no external fire, and JSONL session forking driven by its [agentic loop](../concepts/pi-agentic-loop.md). Those differences are decisive *within* the paradigm: Claude Code gives free ANSI terminal rendering at the cost of structured control, while Pi's RPC mode gives structured control at the cost of terminal rendering. But they are variations on one theme. In both cases Meeseeks spawns a child process, owns its lifecycle, must reconstruct lifecycle state from the outside (hooks or an event stream that no external mechanism fires), and must synthesize what the user sees. The supervisor's core machinery — `buildSpawnSpec`, the ring buffer, PTY/stdio I/O, enter-key detection, the `termKillMs` kill escalation — applies to both. Choosing Pi over Claude Code is choosing a different CLI to supervise; it does not change what Meeseeks is.

## The apex fork: what Meeseeks becomes

This is the fork the other syntheses circle but never state head-on. The paradigm is not a property of the harness — it is a property of *Meeseeks*.

Under the **supervised-CLI paradigm**, Meeseeks remains what it is today: a process supervisor that owns spawning, PTY I/O, a lossy in-memory ring buffer, hook-based state reconstruction, xterm.js [console rendering](../components/console.md), and — because a killed process loses its session — the *absence* of runtime persistence, which is why "persistence across server restarts" is a deferred feature. The supervisor's entire design is load-bearing.

Under the **framework/server paradigm**, most of that machinery is retired. The [Agent Server](../components/langgraph-agent-server.md) delivers run status, [durable checkpointed threads](../concepts/langgraph-durable-execution.md), and interrupts as structured HTTP events; a LangChain adapter would be an API client, not a process supervisor. Several of Meeseeks' own deferred features — persistence, autonomous triggers (native cron), multi-provider model switching — arrive as properties of the runtime rather than things to build. Meeseeks stops reverse-engineering state and starts subscribing to it.

The paradigm split is not merely conceptual — it is already latent in Meeseeks' own type system. As the [Runtime Supervisor](../components/runtime.md) page details, the supervisor's `SpawnSpec` abstraction (argv/env/cwd/settingsFile) is process-shaped: it can be generalized over CLIs to admit Pi, but an HTTP client or embedded library object cannot be expressed as an argv at all. And the `runtime.harness` config field, which anticipates pluggability, currently goes unread — the supervisor hard-imports the Claude Code adapter. So paradigm B is not a new adapter behind an existing seam; it is a runtime representation the current types cannot hold, which is the strongest possible confirmation that the paradigm choice reshapes Meeseeks rather than the harness.

## The paradigm-level comparison

The [LangChain harness synthesis](langchain-as-meeseeks-harness.md) tabulates the three harnesses dimension by dimension. Collapsed to the paradigm level, the pattern is cleaner — and every row is the same story told twice:

| Dimension | Supervised-CLI paradigm (Claude Code, Pi) | Framework/server paradigm (LangChain) |
|-----------|--------------------------------------------|----------------------------------------|
| Who owns the loop | The orchestrator drives an external process | The runtime; the orchestrator embeds or calls it |
| Lifecycle state | Reverse-engineered (hooks, debounce, or an event stream) | Delivered structurally (explicit run status, typed [stream projections](../concepts/langchain-streaming.md), interrupts) |
| Durability & fault tolerance | Hand-built or absent — a lossy ring buffer, no retries | Native: checkpointed threads plus per-node [retries/timeouts/error handlers](../concepts/langgraph-fault-tolerance.md) |
| Rendering | Free ANSI (Claude) or synthesize-from-events (Pi) — terminal-shaped | Typed agent-state via the TypeScript [`useStream` SDK](../concepts/langchain-frontend-rendering.md) |
| Control surface | Raw PTY input (Claude) or 30-command RPC (Pi) | Runs/threads/cron/double-texting over HTTP |
| Content safety | Access control only (allow/deny, sandbox) | Access control **plus** in-band [guardrails](../concepts/langchain-guardrails.md) |
| Persistence | None exposed (Claude) or JSONL files (Pi) | Durable by construction; resumes after restart |
| Meeseeks' identity | **Process supervisor** | **API client / embedder** |

The bottom row is the whole argument. Every other row is downstream of it.

## Where the binary breaks down

The two-paradigm frame is a simplification, and the [build-vs-supervise synthesis](harness-sdk-build-vs-supervise.md) supplies the refinement: there is a *third posture* — building an agent on a harness SDK ([Claude Agent SDK](../systems/deep-agents.md) or Deep Agents) rather than supervising a finished CLI or attaching to a running server. That posture straddles the paradigms: you own the agent definition (like the CLI paradigm) but inherit the runtime's durability, streaming, and — with Deep Agents — a shipped Agent Server (like the framework paradigm). It is best understood not as a third paradigm but as the seam through which the supervised-CLI world migrates into the framework/server world. Notably, Deep Agents' own [`dcode` CLI](../systems/deep-agents.md) is a supervised-CLI-paradigm surface *over* a framework/server-paradigm runtime — proof that the two are endpoints of a spectrum, not a hard dichotomy.

## Implications for Meeseeks

The paradigm choice reduces to a single question: **does Meeseeks own the agent runtime, or delegate it?** Staying in the supervised-CLI paradigm keeps Meeseeks in full control of the process and its terminal rendering, at the standing cost of hand-building durability, state detection, and persistence — the work its deferred-feature list already records as unfinished. Moving to the framework/server paradigm hands those capabilities over wholesale, retiring large parts of the supervisor, at the cost of Meeseeks' PTY-and-hooks identity and its xterm.js rendering model. The [rendering gap](../concepts/langchain-frontend-rendering.md) that once made the second paradigm look prohibitive turned out to be narrow — LangChain's frontend SDK is TypeScript and would live inside Meeseeks' existing React SPA — which weakens the strongest argument for staying put.

The trajectory argument tilts the same way: the LangChain docs frame decoupled model/backend/deployment architectures as where production agents are heading, which implies the supervised-CLI paradigm — and Meeseeks' coupling to it — is the less durable long-term bet. None of this forces a migration; Meeseeks works, and the supervised-CLI paradigm is the pragmatic choice for a single-user local tool today. But when the project weighs generalizing beyond Claude Code, the decision that matters is not Pi-or-LangChain. It is process-supervisor-or-client — and everything else follows from it.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | `src/runtime/supervisor.ts`, `src/runtime/claude-code.ts` — the process-supervisor machinery |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/overview — durable execution, streaming, HITL, persistence |
| 2026-07-11 | https://docs.langchain.com/langsmith/agent-server — the Agent Server control surface |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/modes/rpc/rpc-types.ts:RpcCommand` |
