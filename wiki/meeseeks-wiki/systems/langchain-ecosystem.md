# LangChain Ecosystem

LangChain is a third candidate agentic harness for Meeseeks, alongside the [Claude Code](claude-code.md) harness that the platform depends on today and the [Pi coding agent](pi.md) it has evaluated as an interchangeable component. It differs from both in a way that reframes the whole integration question: LangChain is not a CLI process an orchestrator supervises over a PTY. It is a *framework* you build an agent in, layered on an orchestration *runtime*, with an optional deployment *server* that exposes agents over HTTP. The consequences of that difference are analysed in the [LangChain as a Meeseeks harness](../syntheses/langchain-as-meeseeks-harness.md) synthesis; this page maps the ecosystem so that comparison has a vocabulary.

The ecosystem is a layered stack, and the LangGraph overview documentation (`docs.langchain.com/oss/python/langgraph/overview`) states the layering explicitly: Deep Agents is a harness on top of LangChain; LangChain is the agent framework; LangGraph is the orchestration runtime; LangSmith is the platform for tracing, evaluation, and deployment across all of them.

## LangChain — the agent framework

The core library provides [`create_agent`](../components/langchain-create-agent.md), described in its own overview (`docs.langchain.com/oss/python/langchain/overview`) as "a minimal, highly configurable agent harness." Its organizing slogan is **Agent = Model + Harness**: the harness is everything around the model-calling loop — the system prompt, the tools, and any [middleware](#middleware-the-hook-system) that shapes behaviour. An agent, in LangChain's definition, "is a model calling tools in a loop until a given task is complete." The building blocks each have a dedicated page: the [standard model interface](../components/langchain-models.md), [tools](../components/langchain-tools.md), [messages and content blocks](../concepts/langchain-messages.md), [memory and context engineering](../concepts/agent-memory.md), [retrieval and RAG](../concepts/langchain-retrieval.md), [streaming](../concepts/langchain-streaming.md), and [multi-agent patterns](../concepts/langchain-multi-agent.md).

Two properties matter for Meeseeks. First, a **standard model interface**: the same `create_agent(model="provider:model", tools=[...])` call targets OpenAI, Anthropic, Google, Bedrock, Ollama, OpenRouter, Fireworks, Azure, and more by changing a string — a far cheaper model-swap than either Claude Code (static spawn flag) or Pi (RPC `cycle_model`). Second, `create_agent` does not run its own loop; it compiles down to a [LangGraph](#langgraph-the-orchestration-runtime) graph, inheriting that runtime's durability, streaming, and human-in-the-loop machinery. Both Python and JavaScript implementations exist, which is relevant given Meeseeks is a TypeScript/Node platform.

## LangGraph — the orchestration runtime

LangGraph is the low-level runtime underneath. Its overview bills it as "a low-level orchestration framework and runtime for building, managing, and deploying long-running, stateful agents," focused on four capabilities: **durable execution, streaming, human-in-the-loop, and persistence**. These are exactly the capabilities the [Meeseeks Runtime Supervisor](../components/runtime.md) has to reconstruct by hand around an opaque Claude Code process, which is why the runtime — not the surface syntax — is the substantive part of the comparison. Its execution semantics and control seams are documented across [LangGraph durable execution](../concepts/langgraph-durable-execution.md), the [Graph API and Pregel runtime](../concepts/langgraph-graph-api.md), and [human-in-the-loop and time travel](../concepts/human-in-the-loop.md).

## Deep Agents — the batteries-included harness

Deep Agents (`create_deep_agent`), covered in full on the [Deep Agents](deep-agents.md) system page, is the closest analog in the ecosystem to Claude Code as a *coding* agent. Built on top of LangChain agents, its overview (`docs.langchain.com/oss/python/deepagents/overview`) lists built-in task planning, a virtual filesystem for context management, subagent spawning in isolated context windows, long-term memory, and human-in-the-loop approval. It ships filesystem tools (`ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep`), declarative `FilesystemPermission` allow/deny/interrupt rules on those tools, and sandbox *backends* that additionally grant an `execute` tool for shell commands inside an isolated environment. There is also a "Deep Agents Code" CLI with a `--sandbox` flag — the one part of the ecosystem that resembles a coding CLI in the Claude Code / Pi mould. Deep Agents' permission and sandbox model is compared to Claude Code's OS-level sandboxing in the [runbook on Claude Code sandboxing](../runbooks/claude-code-sandboxing.md) framing within the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md).

## Agent Server — the deployment surface

The piece that actually behaves like a supervisable harness is the **Agent Server** (LangSmith Deployment; formerly LangGraph Platform). It exposes agents over an HTTP API built around [assistants, threads, runs, and cron jobs](../components/langgraph-agent-server.md), with a Redis-backed task queue and Postgres-backed persistence. For an orchestrator this is the richest of the three integration targets and the one a Meeseeks adapter would most plausibly target — it is documented in full on the [LangGraph Agent Server](../components/langgraph-agent-server.md) component page.

## LangSmith — the observability and platform layer

LangSmith, detailed on its own [system page](langsmith.md), is the surrounding platform for tracing, evaluation, prompt management, and deployment. Two features are worth noting for an orchestrator: **LangSmith Engine** monitors agent traces, detects issues, and can open a pull request with a proposed fix; **LangSmith Fleet** is a no-code agent builder. LangSmith also provides first-party managed **sandboxes** (resources, snapshots, service URLs, an auth proxy) usable from the SDK. Because Meeseeks already supervises coding agents, LangSmith's [observability](../concepts/langsmith-observability.md) is orthogonal-but-complementary — its framework-agnostic tracing would observe an agent Meeseeks runs (Claude Code included), not replace any Meeseeks responsibility, and its [evaluation](../concepts/langsmith-evaluation.md) is how one harness could be measured against another.

## Middleware — the hook system

Middleware is LangChain's programmable control seam, and it is the direct analog to Claude Code's external hooks and Pi's in-process callbacks. Middleware is passed to `create_agent(middleware=[...])` and, per its overview (`docs.langchain.com/oss/python/langchain/middleware/overview`), "is not a separate runtime: hooks run inside the compiled LangGraph." Hooks fire at `before_model` / `after_model` (node-style) and `wrap_model_call` / `wrap_tool_call` (wrap-style), can extend agent state, register additional tools, and read the [Runtime](../concepts/langgraph-durable-execution.md) object for dependency injection. Prebuilt middleware covers summarization, PII detection, tool retry, model fallback, model-call limits, an LLM tool-selector, and — most relevant to supervised execution — `HumanInTheLoopMiddleware`, which turns tool calls into durable interrupts. Like Pi's callbacks and unlike Claude Code's `curl` hooks, middleware is in-process code; unlike Pi, when run under the Agent Server those in-process interrupts become externally observable HTTP events.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/agents |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/permissions |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/sandboxes |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/middleware/overview |
| 2026-07-11 | https://docs.langchain.com/langsmith/agent-server |
