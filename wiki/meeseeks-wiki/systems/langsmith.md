# LangSmith

LangSmith is the platform layer of the [LangChain ecosystem](langchain-ecosystem.md) — the surrounding infrastructure for tracing, evaluation, prompt engineering, deployment, and operations that spans all the frameworks beneath it. Its own overview positions it as "the platform for tracing, evaluation, prompts, and deployment across frameworks," and critically it is **framework-agnostic**: it traces and evaluates agents built with LangChain, LangGraph, or Deep Agents, but also OpenAI Agents SDK, CrewAI, Claude Code, Codex, and many others via [OpenTelemetry](../concepts/langsmith-observability.md). For Meeseeks this is the one part of the ecosystem that is *complementary rather than competitive* with Claude Code — it would observe and evaluate whatever agent Meeseeks runs rather than replace it. This page is the hub; two of its capabilities have their own pages: [observability](../concepts/langsmith-observability.md) and [evaluation](../concepts/langsmith-evaluation.md).

## Observability

LangSmith Observability records, inspects, and analyzes every step an LLM application takes, structured as **projects → traces → runs**, with multi-turn conversations linked as **threads**. It is the debugging and monitoring surface for any agent, and it explicitly traces non-LangChain harnesses — including Claude Code and the Pi coding agent — through dedicated integrations and OTel. The data model and ingestion paths are covered on the [observability](../concepts/langsmith-observability.md) page.

## Evaluation

LangSmith Evaluation is "a framework for measuring quality throughout the application lifecycle, from pre-deployment testing to production monitoring." It splits into **offline** evaluations (benchmarking, regression testing, unit testing, backtesting against curated **datasets**) and **online** evaluations (scoring live production traces), with evaluators ranging from code assertions to **LLM-as-judge**. The details are on the [evaluation](../concepts/langsmith-evaluation.md) page. Evaluation matters to an orchestrator because it is how you would know whether a swapped harness (Claude Code vs. a LangChain agent) actually performs better on a given task, rather than guessing.

## Prompt engineering

LangSmith treats prompts as first-class, versioned artifacts because "AI applications often derive their logic from prompts" rather than code. It supports **chat** prompts (a list of role-tagged messages, the recommended modern format) and legacy **completion** prompts (a single string), managed in a prompt hub with commits and programmatic access. The framing is explicitly cross-functional: "the most effective prompt engineer may be a product manager or domain expert rather than the software engineer," so the tooling exists to let non-engineers iterate on prompts safely.

## Studio

Studio is a specialized **agent IDE** for systems that implement the [Agent Server](../components/langgraph-agent-server.md) API protocol. It visualizes a graph's architecture, runs and interacts with the agent, manages assistants and threads, iterates on prompts, runs experiments over datasets, manages long-term memory, and debugs agent state via [time travel](../concepts/human-in-the-loop.md). It is the closest analog in the ecosystem to a supervision console like Meeseeks' own — a UI for driving and inspecting a running agent — though it targets the Agent Server protocol rather than a PTY process.

## Engine — the agent for agent engineering

LangSmith **Engine** is described as "the agent for agent engineering": it works from production traces to close a loop — **detect** a recurring issue, **diagnose** its root cause, **propose** a fix, **deploy** an evaluator to catch regressions, and **reopen** the issue automatically if it resurfaces. Notably, Engine can "open a pull request in your connected repository" with a proposed code change for agents built with Deep Agents, LangChain, and LangGraph, and generate ground-truth dataset examples from production trace inputs. This is a self-improving-agent capability with no analog in Meeseeks' current Claude Code integration.

## Insights and Fleet

**Insights** automatically analyzes traces to detect usage patterns, common agent behaviors, and failure modes through hierarchical categorization, so operators need not read thousands of traces by hand (Plus/Enterprise plans). **Fleet** (formerly Agent Builder) is a **no-code** platform for creating agents from templates, connecting accounts (Slack, Salesforce, MCP servers), and running routine automation with human approvals — the low-code on-ramp that sits above all the code-first frameworks.

## Deployment

LangSmith is also the deployment home for LangGraph agents, exposing them through the [Agent Server](../components/langgraph-agent-server.md) in managed-cloud, hybrid, standalone, and self-hosted-with-control-plane modes. Deployment, threads, runs, cron, and the task queue are documented on the Agent Server component page; the observability and evaluation layers described here wrap those deployments in production.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/langsmith/observability-concepts |
| 2026-07-11 | https://docs.langchain.com/langsmith/evaluation-concepts |
| 2026-07-11 | https://docs.langchain.com/langsmith/prompt-engineering-concepts |
| 2026-07-11 | https://docs.langchain.com/langsmith/studio |
| 2026-07-11 | https://docs.langchain.com/langsmith/engine-overview |
| 2026-07-11 | https://docs.langchain.com/langsmith/insights |
| 2026-07-11 | https://docs.langchain.com/langsmith/fleet/index |
