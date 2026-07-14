# LangChain Messages and Content Blocks

Messages are the unit of conversation in LangChain: the `messages` list is the agent's running state, the input to every model call, and the output of every turn. The messages documentation (`docs.langchain.com/oss/python/langchain/messages`) defines the type hierarchy and — more importantly for portability — the **standard content block** representation that lets one message model span every provider. This is the LangChain counterpart to the message models that Pi maps through `convertToLlm` and that Claude Code hides inside its stream-json events.

## Message types

Four message types carry a conversation:

- **`SystemMessage`** — instructions that shape the model's behaviour (the `system_prompt` of an [agent](../components/langchain-create-agent.md) becomes one).
- **`HumanMessage`** — user input, text or multimodal.
- **`AIMessage`** — model output, which may contain text, reasoning, and tool-call requests.
- **`ToolMessage`** — the result of executing a tool call, linked back to its request by id.

Messages can be built from plain strings, dictionaries (`{"role": ..., "content": ...}`), or the typed classes; all three forms are accepted wherever the framework expects messages.

## Content: loosely typed payload, standard blocks on top

A message's `content` is deliberately loosely typed — a string, a list of provider-native objects, or a list of **standard content blocks** — so provider-specific structures (OpenAI's `image_url`, Anthropic's `thinking`) can pass through unchanged. On top of that, LangChain layers a `content_blocks` property that **lazily parses** whatever is in `content` into a consistent, type-safe representation. An Anthropic `thinking` block and an OpenAI `reasoning` block both read back as the same `ReasoningContentBlock`, so downstream code inspects one shape regardless of which provider produced the message.

Passing `content_blocks` when constructing a message still populates `content`, but gives a type-checked interface for doing so — the recommended way to author multimodal or structured content.

## Multimodal and reasoning

Standard content blocks are the vehicle for [multimodal](../components/langchain-models.md) input and output — images, audio, and video attached as typed blocks with a `url` or inline data — and for **reasoning**: models that expose internal reasoning surface it as reasoning blocks that can be streamed incrementally through the [streaming](langchain-streaming.md) system, and citations, server-side tool calls, and other rich content each have their own block type in the content-block reference.

Why this matters across the wider wiki: the provider-portable message model is the concrete substrate behind LangChain's [standard model interface](../components/langchain-models.md). It is what makes a one-string model swap safe — the conversation representation does not change when the provider does — and it is the format a Meeseeks adapter would have to render into console output if it consumed a LangChain agent's [message stream](langchain-streaming.md) rather than a terminal PTY.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/messages |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/models |
