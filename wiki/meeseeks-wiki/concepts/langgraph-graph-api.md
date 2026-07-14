# LangGraph Graph API and the Pregel Runtime

Beneath every LangChain [agent](../components/langchain-create-agent.md) is a LangGraph graph, and beneath every graph is the **Pregel runtime**. This page digests how LangGraph models computation — as a graph of state, nodes, and edges executed in bulk-synchronous super-steps — and the two authoring APIs (Graph and Functional) that sit on top of it. It complements the [durable-execution](langgraph-durable-execution.md) page, which covers what the runtime provides (persistence, streaming, interrupts); here the subject is how the runtime *executes*.

## Workflows vs. agents

The workflows-and-agents guide (`docs.langchain.com/oss/python/langgraph/workflows-agents`) draws the framing distinction the rest of the ecosystem inherits: **workflows have predetermined code paths and run in a fixed order; agents are dynamic and define their own process and tool usage.** LangGraph is deliberately low-level enough to express both, and to mix them — a deterministic workflow with an agent embedded as one node, or an agent with deterministic pre/post steps. This is the same continuum the [retrieval](langchain-retrieval.md) docs invoke as 2-step vs. agentic RAG.

## The three components: State, Nodes, Edges

The Graph API (`docs.langchain.com/oss/python/langgraph/graph-api`) models an application as a graph with three pieces:

- **State** — a shared data structure (typically a typed schema) that is the current snapshot of the application. **Reducers** define how updates to a state field are merged (e.g. appending to a `messages` list rather than replacing it).
- **Nodes** — functions that encode the work. Each receives the state, performs computation or a side-effect, and returns a state update. "Nodes do the work" — and a node may contain an LLM call or "just good ol' code."
- **Edges** — functions that decide which node runs next, as fixed transitions or conditional branches. "Edges tell what to do next."

Composing nodes and edges produces looping, branching workflows that evolve state over time. The `StateGraph` class is the main entry point; compiling it yields a runnable graph.

## Pregel: super-steps, actors, and channels

Execution follows a **message-passing** model inspired by Google's Pregel and the Bulk Synchronous Parallel model. The runtime (`docs.langchain.com/oss/python/langgraph/pregel`) combines **actors** (`PregelNode`s that read and write channels) with **channels**, and proceeds in discrete **super-steps**, each with three phases: **plan** (select the actors whose input channels were updated last step), **execution** (run the selected actors in parallel; their channel writes are invisible to each other until the step ends), and **update** (apply the writes to channels). Nodes run in parallel *within* a super-step and sequentially *across* super-steps. All nodes start inactive; a node activates when a message arrives on an incoming channel, runs, and votes to halt; execution terminates when every node is inactive and no messages are in transit. This actor-and-channel model is what makes deterministic message ordering, parallel fan-out, and checkpoint-per-super-step possible.

## Two APIs over one runtime

LangGraph exposes the same runtime through two authoring styles (`docs.langchain.com/oss/python/langgraph/choosing-apis`), usable together in one application:

- **Graph API** — declarative: define `State`, nodes, and edges explicitly. Choose it for complex workflows that benefit from **visualization**, explicit shared-state management, multiple conditional branches, parallel paths that merge, and team collaboration. A new checkpoint is written after every super-step.
- **Functional API** — imperative: mark a function `@entrypoint` and its units of work `@task`, and use ordinary `if`/`for`/function-call control flow. It adds persistence, memory, human-in-the-loop, and streaming "with minimal changes to existing code," without forcing a DAG. State is function-scoped (no explicit `State` or reducers), task results are saved into the entrypoint's existing checkpoint rather than creating new ones, and there is no graph visualization since the graph is generated at runtime.

Notably, the [Agent Server](../components/langgraph-agent-server.md) can deploy agents written in *other* frameworks by wrapping them through the Functional API — the mechanism by which a LangGraph-based Meeseeks adapter could supervise more than just LangChain agents.

## Subgraphs

A **subgraph** is a graph used as a node inside another graph (`docs.langchain.com/oss/python/langgraph/use-subgraphs`). Subgraphs are the composition primitive behind [multi-agent systems](langchain-multi-agent.md), node reuse across graphs, and distributed development — different teams own different subgraphs, and as long as each honours its input/output schema, the parent graph is built without knowing its internals. Because a compiled [`create_agent`](../components/langchain-create-agent.md) is itself a graph, an entire agent (middleware and all) drops into a larger `StateGraph` as one subgraph node.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/graph-api |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/pregel |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/functional-api |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/choosing-apis |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/workflows-agents |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/use-subgraphs |
