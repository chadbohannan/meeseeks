# Building a Harness vs. Supervising One

Meeseeks treats its agentic harness as an opaque external process: it spawns the Claude Code CLI, supervises it over a PTY, and scrapes state back out through injected hooks. The [Claude Code vs. Pi comparison](claude-vs-pi-runtime-interfaces.md) and the [LangChain harness synthesis](langchain-as-meeseeks-harness.md) both take that supervision model as given and ask *which process to supervise* or *which server to attach to*. This page raises the question one level higher, because the LangChain docs ship a comparison that Meeseeks' own architecture makes unavoidable: instead of supervising a finished coding agent, an orchestrator can **build** its agent on a harness SDK and own the loop directly. The docs' side-by-side of Deep Agents and the Claude Agent SDK (`docs.langchain.com/oss/python/deepagents/comparison`, drafted 2026-04-16) is exactly the build-side version of Meeseeks' vendor-coupling decision.

## Three integration postures, not two

Once "build your own harness" is on the table, Meeseeks has three distinct postures toward an agent, not the binary the other syntheses imply:

1. **Supervise a finished CLI** — spawn Claude Code (today), Pi, or Deep Agents' [`dcode`](../systems/deep-agents.md) as a child process and drive it over stdio/PTY or RPC. This is the current [Runtime Supervisor](../components/runtime.md) model. The harness is a black box; Meeseeks owns process lifecycle, output rendering, and state reverse-engineering.
2. **Build on a harness SDK** — import a library (the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) or [Deep Agents' `create_deep_agent`](../systems/deep-agents.md)) and construct the agent loop in-process. Meeseeks owns the agent definition — model, tools, permissions, subagents — but inherits the SDK's loop rather than parsing a CLI's terminal output.
3. **Client of an Agent Server** — connect to a running [LangGraph Agent Server](../components/langgraph-agent-server.md) over HTTP. Meeseeks owns nothing of the loop and speaks a runs/threads API, as analysed in the [LangChain harness synthesis](langchain-as-meeseeks-harness.md).

Meeseeks lives entirely in posture 1 today. The Claude Agent SDK and Deep Agents are the two credible entrants into posture 2, and the docs' comparison is a map of what that move costs. Posture 2 is also the seam between the two paradigms named in the [harness-paradigms capstone](harness-paradigms.md): building on an SDK is how the supervised-CLI world migrates toward the framework/server world, which is why that capstone treats this page as the refinement that breaks its otherwise-binary framing.

## The decoupling axis

The through-line of the docs' comparison is a single question — how much does the harness bundle together — and the two SDKs sit at opposite ends. The **Claude Agent SDK** bundles model, execution backend, and deployment and "optimizes support between all three"; its agent runs *inside* a sandbox against that sandbox's local filesystem, targets Claude models only (via Anthropic, Bedrock, Vertex, Azure), and leaves the HTTP/WebSocket/SSE server, auth, and multi-tenancy for the integrator to build. **Deep Agents** decouples the same three axes: the agent can run inside a sandbox *or* outside it [using the sandbox as a tool](https://www.langchain.com/blog/the-two-patterns-by-which-agents-connect-sandboxes), the [execution backend is pluggable](../systems/deep-agents.md) (local, virtual filesystem, remote sandbox, custom), the model is any of 100+ providers, and a production [agent server](../components/langgraph-agent-server.md) with streaming, threads, run history, webhooks, and auth ships in the box.

| Axis | Claude Agent SDK | Deep Agents |
|------|------------------|-------------|
| Where the agent runs | Inside a sandbox only | Inside a sandbox, or outside using it as a tool |
| Execution backend | Local filesystem of its sandbox | Pluggable: local / virtual FS / remote / custom |
| Model provider | Claude only (Anthropic, Bedrock, Vertex, Azure) | Any (100+ providers) |
| Per-model tuning | In code at each call site | Declarative harness profiles (beta) |
| Deployment | Self-host; build server/auth/streaming yourself | Managed (LangSmith) or self-host via `langgraph build` |
| Multi-tenancy | Build it yourself | Built-in: scoped threads, per-user sandboxes, RBAC |
| License | MIT (Claude Code itself proprietary) | MIT |

The docs' own summary is a clean decision rule: choose the Claude Agent SDK "if you are already invested in the Anthropic ecosystem and wish to self-host and build the API, auth, and multi-tenant layers yourself"; choose Deep Agents "if you want model and infrastructure flexibility, built-in multi-tenant deployment, and the option to run managed or self-hosted without code changes."

## Why this is Meeseeks' decision specifically

Meeseeks is *already* Claude-coupled — it depends on Claude Code, a proprietary CLI. Posture 2 would let it keep that coupling deliberately (Claude Agent SDK) or shed it (Deep Agents), but either way it changes what Meeseeks *is*. Several columns of the table are features Meeseeks currently hand-builds or defers:

- **The agent server row is the Runtime Supervisor's whole reason to exist.** The Claude Agent SDK explicitly hands the integrator "the server, auth, and streaming layer" — which is precisely what Meeseeks' Fastify server, WebSocket hub, and console rendering already are. Adopting the Claude Agent SDK would mean Meeseeks keeps building that layer (it already has one); adopting Deep Agents would mean *retiring* it in favor of the shipped Agent Server, the same trade the [LangChain harness synthesis](langchain-as-meeseeks-harness.md) reaches from the client side.
- **Multi-tenancy is a Meeseeks deferred feature.** The project lists multi-user access as not-yet-implemented; Deep Agents ships scoped threads, per-user sandboxes, and RBAC, while the Claude Agent SDK leaves it to be built.
- **Model swap is a static Claude Code spawn flag today.** Deep Agents' any-provider model interface is the same multi-provider advantage the [`create_agent` model layer](../components/langchain-models.md) offers; the Claude Agent SDK stays within the Claude family.

An earlier version of this page argued that posture 2's richest option, Deep Agents, "leads in Python," giving posture 3 (HTTP client of the Agent Server) an easy win for a TypeScript/Node platform. That language-fit tension turns out to be much weaker than claimed: `createDeepAgent` is first-class in JavaScript/TypeScript (Node 22+), as the [`create_agent` embed grounding](../components/langchain-create-agent.md#embedding-in-a-host-process-the-typescript-path) documents, so building on Deep Agents in-process does *not* mean importing a Python agent loop into a Node process. The real reason posture 3 still tends to dominate posture 2 for Meeseeks is therefore not language but the **coordination layer**: the Agent Server ships multi-tenancy, double-texting, background runs, and managed persistence that posture 2 would leave Meeseeks to build itself — the same server-vs-bare-framework trade the [harness synthesis](langchain-as-meeseeks-harness.md) draws.

## The strategic read

The [claude-vs-pi comparison](claude-vs-pi-runtime-interfaces.md) is a *supervision* comparison — two black-box CLIs measured on process and protocol. This is a *construction* comparison — two SDKs measured on how much they let you decouple. They answer different questions, and Meeseeks needs both: whether to keep supervising an opaque agent at all, and if it builds one instead, whether to stay inside Anthropic's integrated stack or generalize. The docs frame Anthropic's own [Claude managed agents](https://platform.claude.com/docs/en/managed-agents/overview) as evidence that "production agent architectures are heading" toward the decoupled model — which, if true, is an argument that Meeseeks' Claude Code coupling is the less durable bet, and that the Deep Agents / Agent Server direction analysed across these syntheses is where a harness-generalization effort should point.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/comparison |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/backends |
| 2026-07-11 | https://docs.langchain.com/langsmith/agent-server |
