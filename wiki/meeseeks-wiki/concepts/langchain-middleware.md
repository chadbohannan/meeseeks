# LangChain Middleware

Middleware is LangChain's mechanism for controlling what happens inside an agent, and it is the single most important extension point in the framework. Its overview (`docs.langchain.com/oss/python/langchain/middleware/overview`) is emphatic that "middleware is not a separate runtime: hooks run inside the compiled LangGraph that `create_agent` returns" — so a middleware-laden agent is still one graph, and the whole stack travels with the agent if it is embedded as a node in a larger workflow. Middleware is the LangChain counterpart to Claude Code's external `curl` hooks and Pi's in-process `beforeToolCall`/`afterToolCall` callbacks, and it is far richer than either; the [Meeseeks harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) treats it as LangChain's control-surface advantage.

## The two hook styles

Custom middleware (`docs.langchain.com/oss/python/langchain/middleware/custom`) exposes two kinds of hook:

- **Node-style hooks** run sequentially at fixed points: `before_agent` and `after_agent` (once per invocation), `before_model` and `after_model` (around every model call). Used for logging, validation, and state updates.
- **Wrap-style hooks** wrap each call: `wrap_model_call` and `wrap_tool_call` receive the request and a `handler`, so they can inspect, modify (`request.override(...)`), retry, or short-circuit a call. This is how dynamic model selection, dynamic tool filtering, and per-call fallbacks are implemented.

A hook can also perform an **agent jump** — returning `jump_to: "end"` (declared via `can_jump_to`) to break out of the loop early, for example when a message limit is reached. Middleware can extend the agent's **state schema** with custom fields, register **additional tools** that ship with it, and register **stream transformers**; multiple middleware compose in a defined execution order (before-hooks outermost-first, after-hooks innermost-first).

## Middleware is how context engineering is done

The [context-engineering](agent-memory.md) documentation frames middleware as "the mechanism under the hood that makes context engineering practical." It lets you hook into any lifecycle step to update context or jump to a different step, across three context types: **model context** (instructions, message history, tools, response format — transient, what the model sees for one call), **tool context** (what tools read and write in state/store — persistent), and **life-cycle context** (what happens between model and tool calls — summarization, guardrails, logging — persistent). This taxonomy is why middleware, not prompt strings, is the reliability lever in LangChain.

## The prebuilt catalog

The built-in middleware (`docs.langchain.com/oss/python/langchain/middleware/built-in`) covers most cross-cutting agent concerns without custom code:

- **Summarization** — condense conversation history before it overflows the context window.
- **[Human-in-the-loop](human-in-the-loop.md)** — turn selected tool calls into durable approval interrupts.
- **Model call limit / Tool call limit** — cap the number of model or tool invocations per run.
- **Model fallback** — try alternate models when a call fails.
- **Model retry / Tool retry** — retry failed model or tool calls with backoff.
- **PII detection** — redact personal data via regex, compiled patterns, or a custom detector.
- **To-do list** — equip an agent with task planning and progress tracking for multi-step work (the mechanism behind Deep Agents' `write_todos`).
- **Context editing** — clear older tool outputs when token limits are hit while preserving recent results.
- **LLM tool selector** — let a model pre-select a relevant tool subset to avoid overloading the main call.
- **LLM tool emulator** — simulate tools for testing without executing them.
- **Shell tool / File search / Filesystem** — expose a persistent shell, glob/grep search, and read/write filesystem tools; the `FilesystemMiddleware` is imported from [Deep Agents](../systems/deep-agents.md) and is included by default there.
- **Subagent** — hand off work to isolated [subagents](../concepts/langchain-multi-agent.md) through a `task` tool, keeping the supervisor's context clean.
- **Provider tool search, Rubric grading, and prompt caching** — provider-specific and specialized helpers.

## Custom middleware

Custom middleware is written either as a decorated function (`@before_model`, `@wrap_model_call`, `@dynamic_prompt`, …) for a single hook, or as an `AgentMiddleware` subclass when a component needs several hooks, both sync and async variants, init-time configuration, or reuse across projects. Common custom patterns include dynamic system prompts (rewriting the prompt from runtime context), dynamic model selection, argument-based tool filtering, tool-call monitoring, and Anthropic prompt caching. Because every hook receives the [`Runtime`](langgraph-durable-execution.md) object, custom middleware has full access to context, store, and execution identity.

Content safety is the most consequential application of this seam: because guardrails — PII redaction, prompt-injection blocking, before/after-agent content filters, and human approval — are themselves middleware, they are documented separately in [LangChain guardrails](langchain-guardrails.md), a capability category Meeseeks currently has no equivalent for.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/middleware/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/middleware/built-in |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/middleware/custom |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/context-engineering |
