# Deep Agents

Deep Agents (`create_deep_agent`, PyPI `deepagents`) is the batteries-included **agent harness** in the [LangChain ecosystem](langchain-ecosystem.md), and the piece most directly comparable to Claude Code as a *coding* agent. Its overview (`docs.langchain.com/oss/python/deepagents/overview`) describes it as "the same core tool-calling loop as other agent frameworks, but with built-in capabilities that make agents reliable for real tasks." It is a standalone library built on LangChain's [`create_agent`](../components/langchain-create-agent.md) building blocks and the [LangGraph](../concepts/langgraph-durable-execution.md) runtime, used in production by OpenSWE and [LangSmith Fleet](langsmith.md). For Meeseeks — whose core feature set currently depends on Claude Code — Deep Agents is the LangChain-ecosystem answer to the same problem, and the docs ship an explicit [comparison with the Claude Agent SDK](#versus-the-claude-agent-sdk).

This page is the hub. Six pages go deeper on its subsystems: the [filesystem backends](../concepts/deepagents-backends.md) that decide where the agent's files actually live and the permission rules over them; the [interpreters](../concepts/deepagents-interpreters.md) that let the agent run code inside the loop and call tools programmatically; the [delegation](../concepts/deepagents-delegation.md) taxonomy separating synchronous, async, and dynamic subagents; the [context-engineering](../concepts/deepagents-context-engineering.md) machinery that keeps the window from overflowing and the [customization](../concepts/deepagents-customization.md) stack that assembles the harness; the [production](../concepts/deepagents-production.md) concerns of multi-tenancy, durability, and fault tolerance; and the packaged runtimes at either end of the spectrum — [`dcode`](deep-agents-code.md) locally and [Managed Deep Agents](managed-deep-agents.md) hosted.

## Four capability categories

Deep Agents organizes its built-in capabilities into four groups, which together define what a "harness" adds over a bare agent loop:

- **Execution environment** — tools and MCP, a virtual filesystem, filesystem permissions, and code execution (sandbox + interpreter).
- **Context management** — skills, memory, summarization, context offloading, and prompt caching.
- **Delegation** — subagent spawning and task planning.
- **Steering** — human-in-the-loop approval and interrupts.

## Execution environment

The environment "is where an agent acts," in four layers. **Tools** are passed via `tools=` and may be custom functions, LangChain tools, or [MCP](../concepts/langchain-mcp.md) tools. The **virtual filesystem** exposes `ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, and `grep` through a *pluggable backend* — in-memory state, local disk, a LangGraph store, a composite router, or a custom backend — with `read_file` natively returning images as multimodal content blocks. **Filesystem permissions** are declarative `FilesystemPermission` allow/deny/**interrupt** rules over path globs, evaluated in order, first match wins. **Code execution** comes two ways: sandbox backends add an `execute` tool for shell commands in an isolated environment (used when the agent must install dependencies, run tests, or call CLIs), while interpreters add an `eval` tool running JavaScript in a scoped QuickJS runtime for lightweight programmatic logic without shell, network, or filesystem access.

This is a materially different containment model from Claude Code's. Where the [Claude Code sandboxing runbook](../runbooks/claude-code-sandboxing.md) describes wrapping the whole agent process in OS-level bubblewrap/Seatbelt, Deep Agents enforces filesystem policy *inside the harness* on its built-in tools and delegates arbitrary execution to a *backend* — the agent can even run outside the sandbox and use the sandbox as a networked tool.

## Context management

Deep Agents makes context engineering first-class. **Skills** package domain expertise (workflows, scripts, reference docs, templates) into reusable directories; the agent reads only skill *summaries* at startup and loads a full skill file only when a task matches it, avoiding context bloat and enabling sharing across agents and projects. **Memory** is filesystem-backed: long-term memory is read and written as files whose location a backend controls, spanning agent-scoped (shared) and user-scoped (isolated) patterns, with optional background consolidation between conversations and read-only vs. writable distinctions for developer-defined skills and org policies. **Summarization and context offloading** compress history and large intermediate results, **subagent isolation** quarantines heavy subtasks, and **prompt caching** is applied automatically to static system-prompt sections for Anthropic and Bedrock models — no configuration required — reducing latency and cost on long runs.

## Delegation and steering

**Task planning** (the `write_todos` tool, from the to-do [middleware](../concepts/langchain-middleware.md)) gives the agent an explicit plan for multi-step work — as of `deepagents` v0.7.0 this middleware is **opt-in** rather than a default-stack member, one of several breaking changes covered on the [customization](../concepts/deepagents-customization.md#the-default-stack-main-agent) page. **Subagents** delegate to workers in isolated context windows through a `task` tool — synchronous by default (the supervisor blocks) with an async variant for parallel workstreams that support mid-flight steering and cancellation; `stream.subagents` gives each delegated task its own [stream](../concepts/langchain-streaming.md) handle. **Steering** is [human-in-the-loop](../concepts/human-in-the-loop.md): approval gates and interrupts on tool calls, inherited from the LangGraph interrupt mechanism.

## Deep Agents Code — the CLI

`dcode` (Deep Agents Code) is an open-source **terminal coding agent** built on the Deep Agents SDK — the one part of the ecosystem shaped like Claude Code or Pi, and the most plausible drop-in comparison point for a Meeseeks console session. Because its documentation has since grown from a stub into a sixteen-page subtree, it now has its own page: [Deep Agents Code](deep-agents-code.md) covers its durable SQLite-backed threads and `--resume`, the `hooks.json` lifecycle-event bus, the Manual/Auto/YOLO approval modes and the two-gate `--allow-fs-tools`/`--shell-allow-list` model, goals and rubrics, `AGENTS.md` instruction layering, plugins, and the specific obstacles a Meeseeks adapter would hit.

The headline finding there is that `dcode` is a supervised-CLI *surface* over this framework/server runtime — it inherits LangGraph checkpointing, and so is durable across restarts while still being an ordinary child process to spawn over stdio. That combination is what the [harness paradigms](../syntheses/harness-paradigms.md) capstone treats as the seam between its two paradigms, and what the [attention-economics synthesis](../syntheses/attention-economics.md) cites as evidence that durability is separable from a migration. The deeper LangChain integration target remains the [Agent Server](../components/langgraph-agent-server.md), as the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) argues — but `dcode` is the cheaper experiment.

## Dynamic subagents and interpreters

Beyond the `task` tool's synchronous and async subagents, Deep Agents adds **dynamic subagents**: with the QuickJS [interpreter](../concepts/langchain-middleware.md) middleware installed (`CodeInterpreterMiddleware`, requiring `langchain-quickjs>=0.2.0`), the agent stops choosing one subagent call at a time and instead *writes an orchestration script* that calls a built-in `task()` global, using JavaScript loops, branches, and parallel batches to fan work out and synthesize the results. The docs frame it for work spanning many independent units or needing multiple perspectives — the worked example is "review every file in `src/` for SQL injection." It is beta, and `dcode` ships with the interpreter enabled so the feature works there with no wiring, surfacing spawned subagents in a live panel grouped into phases by dispatch. For Meeseeks this is a notable inversion of its own supervision model: fan-out is expressed as code the agent writes rather than as an orchestration the supervisor performs.

## Protocols: MCP, A2A, ACP

Deep Agents speaks three interop protocols. **MCP** (Model Context Protocol) lets it consume external tools — the same substrate Claude Code and Pi use. **A2A** (Agent-to-Agent) exposes a deep agent as an A2A server for agent-to-agent calls. **ACP** (Agent Client Protocol) exposes a deep agent to code editors and IDEs, so an editor supplies project context and receives rich updates — the integration lane for IDE clients, distinct from MCP's tool-calling lane.

## Versus the Claude Agent SDK

The docs' side-by-side comparison (`docs.langchain.com/oss/python/deepagents/comparison`) is directly germane to Meeseeks' Claude dependency. Both are MIT-licensed harnesses for building custom agents, but they make different bets:

| Axis | Deep Agents | Claude Agent SDK |
|------|-------------|------------------|
| Where the agent runs | Inside a sandbox, **or** outside it using the sandbox as a tool | Inside a sandbox only |
| Execution backend | Pluggable: local, virtual FS, remote sandbox, custom | Local filesystem of its sandbox |
| Model provider | Any (Anthropic, OpenAI, Google, 100+) | Claude only (Anthropic, Bedrock, Vertex, Azure) |
| Deployment | Managed (LangSmith) or self-host via `langgraph build` | Self-host; you build server, auth, streaming |
| Multi-tenancy | Built-in: scoped threads, per-user sandboxes, RBAC | Build it yourself |
| Agent server | Included (streaming, threads, run history, webhooks, auth) | You write the HTTP/WS/SSE server |

The through-line is decoupling: Deep Agents lets you choose model, execution backend, and deployment target independently, whereas the Claude Agent SDK bundles model, backend, and deployment and optimizes across them. That trade — flexibility vs. an integrated Anthropic-tuned stack — is precisely the choice Meeseeks faces in deciding whether to stay coupled to Claude Code or generalize its harness. This comparison is treated as its own strategic axis — *building* a harness on an SDK rather than *supervising* a finished CLI — in the [build-vs-supervise synthesis](../syntheses/harness-sdk-build-vs-supervise.md), and from the runtime-attachment side in the [LangChain harness synthesis](../syntheses/langchain-as-meeseeks-harness.md).

| Ingest Date | Source |
| ----------- | ------ |
| 2026-08-12 | https://docs.langchain.com/oss/python/releases/changelog (`deepagents` v0.7.0, Jul 24 2026) |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/backends |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/subagents |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/skills |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/memory |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/comparison |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/code-link |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/dynamic-subagents |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/acp |
