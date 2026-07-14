# LangChain Retrieval and RAG

Retrieval is LangChain's answer to two hard limits of language models that the retrieval documentation (`docs.langchain.com/oss/python/langchain/retrieval`) names directly: **finite context** (a model cannot ingest an entire corpus at once) and **static knowledge** (its training data is frozen). Retrieval fetches relevant external knowledge at query time, and combining that with generation is **Retrieval-Augmented Generation (RAG)** — grounding a model's answers in context-specific information it was never trained on. This concept sits alongside [agent memory](agent-memory.md) as the other half of getting the right context into the model.

## The knowledge base and its building blocks

A **knowledge base** is the repository retrieval draws from. LangChain's knowledge-base tutorial (`docs.langchain.com/oss/python/langchain/knowledge-base`) assembles one from a short chain of abstractions, each with a broad integration catalog:

- **Documents** — the unit of stored content, loaded from source formats by **document loaders** (PDFs, web pages, databases).
- **Text splitters** — chop documents into passages small enough to embed and retrieve precisely.
- **Embeddings** — map text into vectors so semantic similarity becomes distance.
- **Vector stores** and **retrievers** — index the embeddings and return the passages most similar to a query.

Critically, the docs note you do **not** need to rebuild an existing knowledge base: an existing SQL database, CRM, or internal documentation system can be connected directly, either as a tool the agent calls or as a source queried up front.

## Two shapes of RAG

The documentation draws a distinction that maps onto the difference between a workflow and an [agent](../components/langchain-create-agent.md):

- **2-step RAG** — a deterministic pipeline: retrieve relevant content, then supply it to the model as context for a single grounded generation. Predictable and cheap; the retrieval always happens.
- **Agentic RAG** — the knowledge base is exposed as a [tool](../components/langchain-tools.md), and the agent *decides* when and what to retrieve, possibly across several rounds, reformulating queries as it reasons. More flexible and better for open-ended questions, at the cost of extra model calls. This is the same trade-off the wider docs draw between fixed [workflows and autonomous agents](langgraph-graph-api.md).

## Where retrieval meets the rest of the stack

Retrieval is not a silo. Its variable-length results are a leading cause of context-window pressure, which is exactly what the [context-editing and filesystem middleware](langchain-middleware.md) exist to manage — offloading large retrieved results out of the message history. And because a retriever is just a tool in agentic RAG, everything true of [tools](../components/langchain-tools.md) — dynamic selection, `ToolRuntime` context access, MCP sourcing — applies to it. For a Meeseeks-style orchestrator, this is the layer that would let an agent ground itself in a project's own documentation or codebase rather than relying solely on what the model was trained on.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/retrieval |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/knowledge-base |
