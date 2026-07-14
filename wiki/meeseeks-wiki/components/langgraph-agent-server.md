# LangGraph Agent Server

The Agent Server (LangSmith Deployment; formerly LangGraph Platform) is the piece of the [LangChain ecosystem](../systems/langchain-ecosystem.md) that behaves like a supervisable agent harness. Where the [Claude Code](../systems/claude-code.md) is a binary Meeseeks spawns over a PTY and Pi is a Node process driven over a 30-command RPC channel, the Agent Server is an **HTTP service** an orchestrator becomes a *client* of. For a Meeseeks adapter it is both the most capable and the most architecturally divergent of the three integration targets, as the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) works through. This page catalogues its control surface.

## The four resources

The server's API (`docs.langchain.com/langsmith/agent-server`) is organized around four resources:

- **Assistants** — a graph plus a configuration; the deployable unit. A graph is a "blueprint" and an assistant is that blueprint configured for a specific task. This is a level of indirection neither Claude Code nor Pi has: the same agent code can back many assistants that differ only in model, prompt, or tools.
- **Threads** — durable, resumable conversations, backed by the [checkpointer](../concepts/langgraph-durable-execution.md). A thread survives server restarts, making it the persistent-session primitive Meeseeks lacks with Claude Code.
- **Runs** — an execution of an assistant on a thread. Runs can be streamed (SSE) or run in the background, can be cancelled in flight, and carry an explicit status.
- **Cron jobs** — scheduled runs, a native autonomous-trigger primitive (one of Meeseeks' own deferred features).

The `langgraph-sdk` client (Python and JS) and a plain REST API both drive these; a threadless run is a stateless one-shot, while a thread-bound run accumulates durable history.

## The client surface

What "Meeseeks becomes a client" means concretely is a small set of `@langchain/langgraph-sdk` calls — and because the SDK is TypeScript, they land directly in Meeseeks' Node stack. An adapter would instantiate one client and drive runs against it, replacing the [supervisor's](runtime.md) spawn-and-scrape machinery with method calls:

```ts
import { Client } from "@langchain/langgraph-sdk";
const client = new Client({ apiUrl: "http://127.0.0.1:2024" });

const thread = await client.threads.create();                    // durable session
const stream = client.runs.stream(thread.thread_id, assistantId, // drive + observe
  { input, streamMode: "updates" });
for await (const chunk of stream) { /* render chunk.data */ }
```

Each call maps onto a supervisor responsibility that the paradigm shift retires:

| SDK call | Replaces in the supervisor |
|----------|----------------------------|
| `new Client({ apiUrl })` | `buildSpawnSpec` + PTY spawn — there is no process to launch |
| `client.threads.create()` | Nothing — there is no durable session today (Claude Code loses it on exit) |
| `client.runs.stream(threadId, assistantId, { input, streamMode })` | `writeInput` plus reading and parsing PTY bytes; `streamMode` selects `values`/`updates`/`messages`/`debug` instead of ANSI |
| `client.runs.create(...)` then `client.runs.join(threadId, runId)` | The **dismiss-without-kill** gesture: start a background run, disconnect, and rejoin later — the [console](console.md)'s detach/reattach as one SDK pair, durable server-side |
| `client.runs.cancel(threadId, runId, { action })` | `terminate`'s `SIGTERM`/`SIGKILL`; `action: "rollback"`/`"interrupt"` expose the double-texting semantics below |
| `client.threads.getState(threadId)` | The ring-buffer `snapshot` — but returning typed durable state, not lossy scrollback |

The `client.runs.join` method is worth singling out: it is the server-side twin of the frontend SDK's `stream.disconnect()`/remount described in [LangChain frontend rendering](../concepts/langchain-frontend-rendering.md), confirming that dismiss-without-kill is a first-class primitive at *both* the adapter and the UI layer of the framework/server paradigm.

## Architecture: API servers, queue workers, task queue

A deployment is not one process but a small system. Per the deployment documentation, it comprises **API servers** (handle client requests — create runs, read thread state, stream results — but do not execute agent code), **queue workers** (the execution engine that listens to a durable task queue, runs the graph, and writes checkpoints), a **Postgres** database (assistants, threads, runs, crons, and checkpoints), and **Redis** (ephemeral signaling, cancellation, and streaming pub/sub between API servers and workers — no user data persists there). Containers are stateless but persistent, and API servers and queue workers scale independently. Deployment modes range from single-host (API server manages the queue directly; the default self-hosted and dev mode) to split API/queue to a fully distributed runtime.

This matters to Meeseeks in a concrete way: supervising a LangChain agent is not "spawn a child process and read its stdio." It is either "call a running Agent Server over HTTP" or "run that whole Postgres+Redis+API+worker stack yourself." The [Runtime Supervisor](runtime.md)'s ring buffer, PTY, and enter-key detection have no role here.

## Run control: double-texting

The Agent Server provides native equivalents of Pi's steering and follow-up queues, called **double-texting** strategies — the behaviour when a second run arrives before the first finishes (`docs.langchain.com/langsmith/double-texting`). There are four: **enqueue** (default — finish the current run, then run the new input sequentially), **reject** (refuse concurrent input), **interrupt** (halt the current run, preserve progress, and continue from that state with the new input — the analog of Pi *steering*), and **rollback** (halt and revert all progress including the original input, treating the new input as a fresh run). The documentation is explicit that double-texting is a feature of LangSmith Deployment and is *not* available in the open-source LangGraph framework — it is a property of the server, not the loop, which is why an embedded (serverless) integration would not get it for free.

## Local development

`langgraph dev` (from `langgraph-cli[inmem]`) launches the Agent Server locally on `http://127.0.0.1:2024` with an in-memory backend, reading a `langgraph.json` that names the graph(s) to serve. This is the closest thing to "just run it" in the ecosystem and the natural first target for a Meeseeks proof-of-concept adapter: a local HTTP endpoint speaking the same runs/threads/streaming API as a cloud deployment, with no Postgres or Redis to stand up.

## Persistence is the server's job

A deployment-registered graph must **not** configure its own checkpointer or store — the server injects the deployment's checkpointer and memory store at runtime and manages them for its own operations (durability, thread state, resumption). Durability mode tunes checkpoint frequency: `async` (default) writes after each step; `exit` stores only the final state. The upshot for an orchestrator is that persistence, the Meeseeks deferred feature of surviving restarts, is handled by the platform rather than by supervisor code.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/langsmith/agent-server |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/deploy |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/local-server |
| 2026-07-11 | https://docs.langchain.com/langsmith/double-texting |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/persistence |
| 2026-07-11 | https://docs.langchain.com/langsmith/background-run — `client.runs.create`/`join`/`get`/`list`, `threads.getState` |
| 2026-07-11 | https://docs.langchain.com/langsmith/cancel-run — `client.runs.cancel` with `action` |
| 2026-07-11 | https://docs.langchain.com/langsmith/streaming — `client.runs.stream`, streamMode values/updates/messages/debug |
