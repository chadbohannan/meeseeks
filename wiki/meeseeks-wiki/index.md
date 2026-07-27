# Wiki Index

## Systems
- [Meeseeks](systems/meeseeks.md) — agent supervision platform for development pipelines
- [Claude Code](systems/claude-code.md) — the agentic harness Meeseeks depends on today: a compiled CLI supervised over a PTY; modes, flags, and the generated settings file
- [Pi](systems/pi.md) — the `pi-mono` coding agent evaluated as an interchangeable harness: four invocation modes, a 30-command RPC protocol, in-process extension hooks, Agent Skills, AGENTS.md/CLAUDE.md context files, and a deliberate no-separate-memory design (session owns all durable state)
- [LangChain Ecosystem](systems/langchain-ecosystem.md) — LangChain/LangGraph/Deep Agents/Agent Server/LangSmith stack as a candidate interchangeable harness
- [Deep Agents](systems/deep-agents.md) — batteries-included coding harness: virtual filesystem, sandboxes, subagents (incl. dynamic/interpreter-driven), skills, memory, HITL; Claude Agent SDK comparison
- [Deep Agents Code (`dcode`)](systems/deep-agents-code.md) — LangChain's terminal coding agent: durable SQLite threads and `--resume`, the `hooks.json` lifecycle bus, Manual/Auto/YOLO approval, goals and rubrics, plugins; a supervisable CLI that is durable anyway
- [Managed Deep Agents](systems/managed-deep-agents.md) — hosted CLI-first runtime (`mda`) for code-first deep agents: the runtime/developer ownership split, Context Hub layout, identity scoping, channels; private beta
- [LangSmith](systems/langsmith.md) — platform layer: observability, evaluation, prompt engineering, Studio, Engine, Insights, Fleet, Managed Deep Agents, deployment

## Components
- [Storage](components/storage.md) — filesystem storage layer with YAML persistence
- [Server](components/server.md) — Fastify server with REST API and WebSocket hub
- [Web UI](components/web.md) — Vite + React SPA: Kanban board, ticket editor, console byte pipeline, and the LangChain-frontend refactor surface
- [Runtime Supervisor](components/runtime.md) — per-ticket Claude Code process supervisor with ring buffer, stream parser, resize guards
- [Console (MDI panels)](components/console.md) — xterm.js panels with dismiss-without-kill gesture
- [LangGraph Agent Server](components/langgraph-agent-server.md) — HTTP harness surface: assistants, threads, runs, cron, double-texting, task queue
- [LangChain `create_agent`](components/langchain-create-agent.md) — the agent harness: model + tools + prompt + middleware, compiled to a LangGraph graph
- [LangChain Models](components/langchain-models.md) — standard multi-provider model interface, structured output strategies, model profiles; scope note on un-ingested provider pages (incl. NVIDIA)
- [LangChain Tools](components/langchain-tools.md) — tool definition, ToolRuntime context, Command, dynamic selection, headless tools, MCP
- [LangSmith Sandboxes](components/langsmith-sandboxes.md) — managed isolated execution: snapshots, the credential-injecting auth proxy and egress posture, mounts, service URLs, creator-scoped permissions

## Concepts
- [Project Model](concepts/project-model.md) — Projects, boards, lanes, and tickets
- [Runtime Supervisor](concepts/runtime.md) — Claude Code runtime lifecycle management (ticket and prompt kinds)
- [Claude Code Instruction Bootstrapping](concepts/claude-code-instruction-bootstrapping.md) — how Claude Code loads `.claude/` instructions across global/project/nested layers, active reload, and why Meeseeks injects board context explicitly
- [Claude Code State Detection](concepts/claude-code-state-detection.md) — reverse-engineering agent state from an opaque process: the hook system, stream-json events, and `awaiting-user` vs `idle`
- [One-Shot Prompts](concepts/one-shot-prompts.md) — board-scoped reusable prompts run non-interactively with JSONL run logs
- [Platform Constraints](concepts/platform-constraints.md) — macOS-specific incompatibilities: chokidar/node-pty, node-pty version, tsx watch scope, env leakage
- [Focus-Gated Editor](concepts/focus-gated-editor.md) — coexisting with the filesystem watcher when editing Markdown that agents may also rewrite
- [Pi Agentic Loop](concepts/pi-agentic-loop.md) — Pi's turn engine: nested run loop, streaming turns, parallel/sequential tool execution, steering vs. follow-up queues, and the stateful Agent wrapper
- [LangGraph Durable Execution](concepts/langgraph-durable-execution.md) — LangChain's runtime: compiled graph loop, checkpointers/threads, interrupts (HITL), streaming projections, runtime context DI
- [LangGraph Graph API & Pregel Runtime](concepts/langgraph-graph-api.md) — state/nodes/edges, super-step execution, Graph vs. Functional API, subgraphs, workflows vs. agents
- [Human-in-the-Loop & Time Travel](concepts/human-in-the-loop.md) — interrupts as durable pauses, HITL approval decisions, checkpoint replay and fork
- [LangChain Middleware](concepts/langchain-middleware.md) — the hook system: node/wrap-style hooks, the prebuilt catalog, custom middleware, context engineering
- [Agent Memory & Context Engineering](concepts/agent-memory.md) — short-term threads vs. long-term store, why context (not the model) fails, middleware as the lever
- [LangChain Messages](concepts/langchain-messages.md) — message types and provider-portable standard content blocks (text, reasoning, multimodal)
- [LangChain Retrieval & RAG](concepts/langchain-retrieval.md) — knowledge bases, embeddings/vector stores, 2-step vs. agentic RAG
- [LangChain Streaming](concepts/langchain-streaming.md) — stream modes and v1.3 typed event-stream projections; the rendering gap for orchestrators
- [LangChain Frontend Rendering](concepts/langchain-frontend-rendering.md) — the TypeScript `useStream` SDK and full pattern catalog (tool cards, interrupts, join/rejoin = dismiss-without-kill, message queues, time travel, headless tools, generative UI); the first-party answer to the PTY-less rendering gap
- [LangGraph Fault Tolerance](concepts/langgraph-fault-tolerance.md) — per-node retries, run/idle timeouts with heartbeats, error handlers; the step-level half of "durable by construction"
- [LangChain Guardrails](concepts/langchain-guardrails.md) — content safety as middleware: PII strategies, HITL approval, before/after-agent filters, layered defense
- [LangChain Multi-Agent Patterns](concepts/langchain-multi-agent.md) — subagents, handoffs, skills, router, custom workflow; Command-based handoffs
- [Model Context Protocol in LangChain](concepts/langchain-mcp.md) — consuming MCP servers (tools, resources, prompts); the shared extension substrate across Claude Code, Pi, and LangChain
- [LangSmith Observability](concepts/langsmith-observability.md) — projects/traces/runs/threads data model; framework-agnostic OTel ingestion (incl. Claude Code, Pi)
- [LangSmith Evaluation](concepts/langsmith-evaluation.md) — offline vs. online evals, datasets/examples, code and LLM-as-judge evaluators, trajectory evals
- [Deep Agents Filesystem Backends](concepts/deepagents-backends.md) — the pluggable filesystem: State/Filesystem/LocalShell/Store/ContextHub/Sandbox/Composite, namespace factories for multi-tenancy, declarative permissions
- [Deep Agents Interpreters & PTC](concepts/deepagents-interpreters.md) — QuickJS `eval` inside the agent loop, programmatic tool calling, dynamic subagents, snapshot persistence, and the capability-scoped security model
- [Deep Agents Delegation](concepts/deepagents-delegation.md) — sync vs. async vs. dynamic subagents, the Agent Protocol lifecycle, the compaction-proof `async_tasks` state channel, `stream.subagents`
- [Deep Agents in Production](concepts/deepagents-production.md) — thread/user/assistant scoping, multi-tenancy and credentials, durability, memory scoping and prompt-injection risk, sandbox lifecycle, fault-tolerance middleware
- [Deep Agents Context Engineering](concepts/deepagents-context-engineering.md) — the five context kinds, nine-part prompt assembly, offloading and dual summarization, progressive disclosure via skills, isolation, long-term memory
- [Deep Agents Customization](concepts/deepagents-customization.md) — the ordered default middleware stack (and why prompt-cache position matters), harness profiles, merge semantics, the middleware that cannot be excluded
- [Context Hub & Context Engineering](concepts/context-hub.md) — versioned agent/skill repos with commits, linked-repo propagation, environment promotion; authored context vs. runtime store state

## Runbooks
- [Project Setup](runbooks/project-setup.md) — installation, development commands, environment variables, and production deployment
- [Claude Code Sandboxing](runbooks/claude-code-sandboxing.md) — permission modes, settings file precedence, OS-level sandboxing, and folder-scoped constraints for orchestrated agents
- [Tracing Meeseeks Sessions to LangSmith](runbooks/tracing-meeseeks-sessions-to-langsmith.md) — piping supervised Claude Code sessions into LangSmith via the first-party plugin and the supervisor's settings-file seam

## Syntheses
- [Architecture Overview](syntheses/architecture-overview.md) — system decomposition and data flow
- [Harness Paradigms: Supervised CLI vs. Framework/Server](syntheses/harness-paradigms.md) — the capstone: Claude Code + Pi as one *supervised-CLI* paradigm vs. LangChain's *framework/server* paradigm, and the process-supervisor-vs-client fork it forces on Meeseeks
- [Claude Code vs. Pi Runtime Interfaces](syntheses/claude-vs-pi-runtime-interfaces.md) — comparative gap analysis of Claude Code and Pi-mono as orchestrator integration targets (intra-CLI-paradigm variation)
- [Pi Agentic Loop Design Patterns](syntheses/pi-agentic-loop-design-patterns.md) — functional-core/imperative-shell, strategy config, event sourcing, producer/consumer queues, and cooperative cancellation in Pi's loop
- [LangChain as a Meeseeks Harness](syntheses/langchain-as-meeseeks-harness.md) — third-target integration analysis: framework-vs-CLI category difference, embed vs. Agent-Server attach points, and the durability/rendering trade-off
- [Building a Harness vs. Supervising One](syntheses/harness-sdk-build-vs-supervise.md) — the Claude Agent SDK vs. Deep Agents decoupling axis; three integration postures (supervise a CLI, build on an SDK, client of a server) and Meeseeks' vendor-coupling decision
- [Two Attention Economies](syntheses/context-economics.md) — Deep Agents' context window and Meeseeks' human focus as the same kind of scarce resource; the four shared moves, the dual-summarization fix for the lossy ring buffer, and why asymmetric retrieval cost inverts the eviction policy
- [Attention Economics](syntheses/attention-economics.md) — the product-side counterpart to the harness cluster: durability gives Meeseeks a past tense, observability turns the attention doorbell into a priority queue, and both are separable from the paradigm migration