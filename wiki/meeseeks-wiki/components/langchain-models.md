# LangChain Models

The model is "the reasoning engine of agents," in the words of the models documentation (`docs.langchain.com/oss/python/langchain/models`): it drives which tools to call, how to interpret results, and when to answer. LangChain's central value proposition around models is a **standard interface** that makes providers interchangeable — the property that makes model-swapping in [`create_agent`](langchain-create-agent.md) a one-string change and that the [Meeseeks harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) contrasts with Claude Code's static spawn flag and Pi's RPC `cycle_model`.

## Standard interface and initialization

Any chat model is initialized either from its provider class (`ChatOpenAI`, `ChatAnthropic`, `ChatGoogleGenerativeAI`, …) or, more portably, through `init_chat_model("provider:model")`, which returns the same standard interface regardless of provider. The supported set spans OpenAI, Anthropic, Google, Azure, AWS Bedrock, Ollama, and many more via `langchain[<provider>]` extras. Models can be used two ways: **inside an agent** (passed to `create_agent`) or **standalone** — called directly for one-off generation, classification, or extraction without any agent loop — and the same interface serves both, so applications can start with a bare model call and scale up to a full agent without rewriting the model layer.

**Scope note — provider pages were not ingested.** This wiki documents the multi-provider interface *as a capability* (one string swaps the provider) but deliberately does not enumerate the per-provider integration pages behind it. LangChain's provider list is long and includes NVIDIA (the `langchain-nvidia-ai-endpoints` package, `ChatNVIDIA`, and NVIDIA NIM microservices), among many others; none of those provider-specific pages have been read into the wiki. So a search of this wiki for "NVIDIA" (or any specific provider beyond the handful named above as interface examples) returning nothing is an intentional gap in what was ingested, not evidence that LangChain lacks that provider. If Meeseeks ever needs a concrete provider grounded — e.g. running agents against NVIDIA-hosted models — the specifics belong here and can be pulled from the `docs-langchain` source on demand.

## Capabilities surfaced through the interface

Beyond text generation, the standard interface exposes four capabilities that agents depend on:

- **Tool calling** — the model emits structured tool-call requests that the agent loop executes; the mechanics live on the [tools](langchain-tools.md) page.
- **Structured output** — the response is constrained to a schema (see below).
- **Multimodality** — image, audio, and video inputs and outputs, carried as [standard content blocks](../concepts/langchain-messages.md) so multimodal payloads are provider-portable.
- **Reasoning** — models that perform multi-step internal reasoning surface it as reasoning/thinking content blocks that can be streamed.

## Structured output strategies

Structured output (`docs.langchain.com/oss/python/langchain/structured-output`) can be requested on a standalone model or, more commonly, on an agent through `response_format`. There are two strategies:

- **Provider strategy** — uses the provider's native structured-output API (OpenAI, Anthropic, xAI, Gemini). Most reliable when available; supports a `strict` flag.
- **Tool strategy** — coerces structured output through a synthetic tool call, for models without native support. Allows custom tool-message content and error handling.

When a bare schema type is supplied, LangChain picks the strategy automatically from the model's capabilities, returning a validated Pydantic instance, dataclass, or dict in the agent's `structured_response` state key. If tools and structured output are used together, the model must support both simultaneously.

## Model profiles

From `langchain>=1.1`, capability decisions (does this model support native structured output? tool calling? a given context window?) are read from **model profile** data attached to each model, rather than hard-coded. A custom `profile` dict can be passed to `init_chat_model` to override or supply capability flags when profile data is missing — the mechanism that lets `create_agent` choose provider-vs-tool strategy dynamically without the caller knowing the model's internals.

## Configuration, caching, and rate limiting

Standard parameters (temperature, max tokens, and provider-specific options) are set at initialization. LangChain also provides cross-cutting model concerns that an orchestrator would otherwise build itself: response **caching** to avoid repeated identical calls, and **rate limiting** to stay within provider quotas — the latter also available as a prebuilt [middleware](../concepts/langchain-middleware.md) so it applies uniformly across an agent's model calls. Server-side tool use (provider-hosted web search, code interpreters) is enabled through the same interface where a provider offers it.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/models |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/structured-output |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/messages |
