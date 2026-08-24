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

### Meeseeks-native
- [Project Model](concepts/project-model.md) — Workspace, workflows, tickets, and the selectable per-codebase Project config
- [Runtime Supervisor](concepts/runtime.md) — Claude Code runtime lifecycle management (ticket and prompt kinds)
- [One-Shot Prompts](concepts/one-shot-prompts.md) — workspace-scoped reusable prompts run non-interactively with JSONL run logs
- [Platform Constraints](concepts/platform-constraints.md) — macOS-specific incompatibilities: chokidar/node-pty, node-pty version, tsx watch scope, env leakage
- [Focus-Gated Editor](concepts/focus-gated-editor.md) — coexisting with the filesystem watcher when editing Markdown that agents may also rewrite
- [Onboarding Seeding](concepts/onboarding-seeding.md) — the three tiers of starting values (ship, detect, clone), why detection proposes instead of writing, and what cloning deliberately leaves behind

### Claude Code
- [Claude Code Instruction Bootstrapping](concepts/claude-code-instruction-bootstrapping.md) — CLAUDE.md scopes and concatenation, auto memory, and why Meeseeks injects workflow context explicitly
- [Claude Code State Detection](concepts/claude-code-state-detection.md) — reverse-engineering agent state from an opaque process via hooks and stream-json events

### Pi
- [Pi Agentic Loop](concepts/pi-agentic-loop.md) — Pi's turn engine: the nested run loop, streaming turns, and the stateful Agent wrapper

### LangChain & LangGraph
- [LangGraph Durable Execution](concepts/langgraph-durable-execution.md) — LangChain's runtime: compiled graph loop, checkpointers/threads, interrupts, streaming projections
- [LangGraph Graph API & Pregel Runtime](concepts/langgraph-graph-api.md) — state/nodes/edges, super-step execution, Graph vs. Functional API, subgraphs
- [Human-in-the-Loop & Time Travel](concepts/human-in-the-loop.md) — interrupts as durable pauses, HITL approval decisions, checkpoint replay and fork
- [LangChain Middleware](concepts/langchain-middleware.md) — the hook system: node/wrap-style hooks, the prebuilt catalog, custom middleware, context engineering
- [Agent Memory & Context Engineering](concepts/agent-memory.md) — short-term threads vs. long-term store, why context (not the model) fails, middleware as the lever
- [LangChain Messages](concepts/langchain-messages.md) — message types and provider-portable standard content blocks (text, reasoning, multimodal)
- [LangChain Retrieval & RAG](concepts/langchain-retrieval.md) — knowledge bases, embeddings/vector stores, 2-step vs. agentic RAG
- [LangChain Streaming](concepts/langchain-streaming.md) — stream modes and v1.3 typed event-stream projections; the rendering gap for orchestrators
- [LangChain Frontend Rendering](concepts/langchain-frontend-rendering.md) — the TypeScript `useStream` SDK; join/rejoin as the PTY-less answer to dismiss-without-kill
- [LangGraph Fault Tolerance](concepts/langgraph-fault-tolerance.md) — per-node retries, run/idle timeouts, error handlers — the step-level half of durability
- [LangChain Guardrails](concepts/langchain-guardrails.md) — content safety as middleware: PII strategies, HITL approval, before/after-agent filters, layered defense
- [LangChain Multi-Agent Patterns](concepts/langchain-multi-agent.md) — subagents, handoffs, skills, router, custom workflow; Command-based handoffs
- [Model Context Protocol in LangChain](concepts/langchain-mcp.md) — consuming MCP servers; the shared extension substrate across Claude Code, Pi, and LangChain

### LangSmith
- [LangSmith Observability](concepts/langsmith-observability.md) — projects/traces/runs/threads data model; framework-agnostic OTel ingestion (incl. Claude Code, Pi)
- [LangSmith Evaluation](concepts/langsmith-evaluation.md) — offline vs. online evals, datasets/examples, code and LLM-as-judge evaluators, trajectory evals

### Deep Agents
- [Deep Agents Filesystem Backends](concepts/deepagents-backends.md) — the pluggable filesystem (State/Filesystem/Store/ContextHub/Sandbox/Composite) and namespace-scoped multi-tenancy
- [Deep Agents Interpreters & PTC](concepts/deepagents-interpreters.md) — QuickJS `eval` inside the agent loop, programmatic tool calling, dynamic subagents
- [Deep Agents Delegation](concepts/deepagents-delegation.md) — sync vs. async vs. dynamic subagents and the compaction-proof `async_tasks` state channel
- [Deep Agents in Production](concepts/deepagents-production.md) — thread/user/assistant scoping, multi-tenancy and credentials, durability, fault tolerance
- [Deep Agents Context Engineering](concepts/deepagents-context-engineering.md) — prompt assembly order, offloading and dual summarization, progressive disclosure
- [Deep Agents Customization](concepts/deepagents-customization.md) — the ordered default middleware stack and harness profiles for per-model tuning
- [Context Hub & Context Engineering](concepts/context-hub.md) — versioned agent/skill repos with commits and environment promotion; authored context vs. store state

### Swarming Agents
- [Multi-Agent Collaboration Taxonomy](concepts/multi-agent-collaboration-taxonomy.md) — the five-dimension taxonomy (actors, types, structures, strategies, coordination protocols) for classifying any multi-agent system's shape
- [Multi-Agent Coordination Theory](concepts/multi-agent-coordination-theory.md) — from classical MARL/CTDE through kernel-drift phase transitions to measured LLM-swarm coordination limits
- [Multi-Agent Frameworks](concepts/multi-agent-frameworks.md) — five architectural philosophies across Swarm, CAMEL, AutoGen/AG2, CrewAI, MetaGPT, ChatDev, and Google's A2A protocol
- [Multi-Agent Failure Modes](concepts/multi-agent-failure-modes.md) — the MAST taxonomy's 14 measured failure modes, agent drift over long sessions, and multi-agent-specific security risks

## Runbooks
- [Workspace Setup](runbooks/project-setup.md) — installation, development commands, environment variables, what the server creates on first open, and the on-disk config shapes
- [Claude Code Sandboxing](runbooks/claude-code-sandboxing.md) — permission modes, settings precedence, and OS-level sandboxing for orchestrated agents
- [Board-to-Workflow Migration](runbooks/board-to-workflow-migration.md) — moving an existing workspace off `project.yaml` + `boards/` onto `workspace.yaml` + `workflows/`
- [Tracing Meeseeks Sessions to LangSmith](runbooks/tracing-meeseeks-sessions-to-langsmith.md) — piping supervised sessions into LangSmith via the supervisor's settings-file seam
- [Reaching the Dev Server From Another Device](runbooks/dev-server-access.md) — what `make dev` exposes, how to narrow it, and why a bare hostname needs naming in `allowedHosts`

## Syntheses
- [Architecture Overview](syntheses/architecture-overview.md) — system decomposition and data flow
- [Harness Paradigms: Supervised CLI vs. Framework/Server](syntheses/harness-paradigms.md) — the capstone: process-supervisor vs. API-client is Meeseeks' real fork, not which harness
- [Claude Code vs. Pi Runtime Interfaces](syntheses/claude-vs-pi-runtime-interfaces.md) — comparative gap analysis of Claude Code and Pi as orchestrator integration targets
- [Pi Agentic Loop Design Patterns](syntheses/pi-agentic-loop-design-patterns.md) — functional-core/imperative-shell, event sourcing, and cooperative cancellation in Pi's loop
- [LangChain as a Meeseeks Harness](syntheses/langchain-as-meeseeks-harness.md) — framework-vs-CLI category difference and the embed-vs-Agent-Server attach-point choice
- [Building a Harness vs. Supervising One](syntheses/harness-sdk-build-vs-supervise.md) — Claude Agent SDK vs. Deep Agents as a build-vs-supervise decoupling axis; three integration postures
- [Two Attention Economies](syntheses/context-economics.md) — Deep Agents' context window and Meeseeks' human focus as the same scarce-resource economy
- [Attention Economics](syntheses/attention-economics.md) — durability and observability as the capabilities that manufacture Meeseeks' attention rather than spend it
- [The Swarm Tax](syntheses/swarm-tax-multi-agent-cost-benefit.md) — when multi-agent systems pay for themselves (read-heavy, parallel) vs. when they're a pure cost (write-heavy, sequential)
- [Multi-Agent Safety and Oversight](syntheses/multi-agent-safety-and-oversight.md) — why individually-safe agents don't compose into a safe system, and why oversight capacity doesn't scale with agent count
- [Static vs. Dynamic Roles in Multi-Agent Success](syntheses/static-vs-dynamic-roles-multi-agent-success.md) — role differentiation reliably helps, but permanence doesn't; adaptive allocation beats fixed roles where cleanly tested