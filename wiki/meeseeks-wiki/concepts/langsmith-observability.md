# LangSmith Observability

Observability is the LangSmith capability that "lets you record, inspect, and analyze every step your LLM application takes" (`docs.langchain.com/langsmith/observability-concepts`). It is the debugging and monitoring surface beneath the whole [LangSmith](../systems/langsmith.md) platform, and the one LangChain feature that is genuinely orthogonal to Meeseeks' harness choice — it observes an agent regardless of who built it, including Claude Code and the [Pi coding agent](../systems/pi.md).

## The data model

LangSmith structures observability data as a nested hierarchy:

- **Project** — a container for all traces of a single application or service.
- **Trace** — the collection of runs for one end-to-end operation (e.g. a user request that triggers a chain calling an LLM and then an output parser). Runs are bound to a trace by a shared trace ID. Conceptually a trace is a collection of OpenTelemetry-style spans, capped at 25,000 runs.
- **Run** — an individual step: one LLM call, one tool invocation, one retrieval.
- **Thread** — links traces from a multi-turn conversation, the observability counterpart to a [LangGraph thread](langgraph-durable-execution.md).

This maps cleanly onto agent execution: an agent run is a trace, each model and tool step is a run, and a conversation is a thread — so the [streaming projections](langchain-streaming.md) an agent emits at runtime become the persisted spans an operator inspects afterward.

## Framework-agnostic ingestion

Observability is deliberately not LangChain-specific. Native tracing exists for LangChain and LangGraph (often via a single `LANGSMITH_TRACING=true` env var), but LangSmith also ingests traces from a long list of other stacks — OpenAI, Anthropic, Bedrock, the OpenAI Agents SDK, CrewAI, AutoGen, Google ADK, Pydantic AI, Vercel AI SDK, and coding agents including **Claude Code**, **Codex**, **Cursor**, **OpenCode**, and **Pi** — plus a generic **OpenTelemetry** path for anything else. This is why LangSmith is complementary to Meeseeks rather than a competitor: Meeseeks could trace its existing Claude Code sessions into LangSmith without adopting any other part of the ecosystem, gaining structured run inspection over sessions it currently only sees as terminal output. The concrete procedure — a first-party Claude Code plugin configured through the same settings file the Runtime Supervisor already writes — is documented in the [runbook on tracing Meeseeks sessions to LangSmith](../runbooks/tracing-meeseeks-sessions-to-langsmith.md).

## What it enables

Beyond inspection, the trace store is the substrate for the rest of the platform: [evaluation](langsmith-evaluation.md) runs against traces and datasets derived from them, [Insights](../systems/langsmith.md) categorizes them to surface failure modes, and [Engine](../systems/langsmith.md) mines them to detect recurring issues and propose fixes. Observability is therefore the foundation the higher-order LangSmith capabilities are built on — collect the traces first, and evaluation, monitoring, and self-improvement follow from them.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/langsmith/observability-concepts |
| 2026-07-11 | https://docs.langchain.com/langsmith/trace-with-langgraph |
| 2026-07-11 | https://docs.langchain.com/langsmith/trace-claude-code |
