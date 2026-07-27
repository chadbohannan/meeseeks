# Deep Agents Customization: the Middleware Stack and Harness Profiles

A [Deep Agent](../systems/deep-agents.md) is not a monolith — it is a documented, ordered stack of [middleware](langchain-middleware.md) assembled by `create_deep_agent`, plus a profile system for varying that stack per model. Understanding the order matters because several behaviours (prompt-cache validity, permission coverage, skill availability) are consequences of *position* rather than of configuration.

## The default stack, main agent

From first to last:

1. **`TodoListMiddleware`** — the `write_todos` planning tool.
2. **`SkillsMiddleware`** — only when `skills` is passed. Injected immediately after todos and **before** filesystem middleware, so skill metadata is available before file tools run.
3. **`FilesystemMiddleware`** — file operations. When `permissions` is passed, [permission enforcement](deepagents-backends.md) lives here, positioned so it can evaluate every tool the agent might call.
4. **`SubAgentMiddleware`** — the `task` tool. Attached only when at least one synchronous subagent exists.
5. **`SummarizationMiddleware`** — history compaction (see [context engineering](deepagents-context-engineering.md)).
6. **`PatchToolCallsMiddleware`** — repairs dangling tool calls when a run resumes after an interruption or receives malformed tool-call arguments. Runs before prompt caching and the tail of the stack.
7. **`AsyncSubAgentMiddleware`** — only when async subagents are configured.
8. **Caller-supplied `middleware`** — merged after Patch. An instance whose `.name` matches a default **replaces that default in place** rather than duplicating it.
9. **Harness profile extras** — provider-specific middleware from the resolved profile.
10. **Excluded-tool filtering** — removes tools the profile excludes.
11. **Prompt caching** (`AnthropicPromptCachingMiddleware`, `BedrockPromptCachingMiddleware`) — both always registered, each no-opping on unsupported models.
12. **`MemoryMiddleware`** — only when `memory` is passed.
13. **`HumanInTheLoopMiddleware`** — only when `interrupt_on` is set.

Two ordering decisions are load-bearing and explained in the docs rather than left implicit. Prompt caching runs **after** Patch and after user middleware, "so the cached prefix matches what is actually sent to the model" — cache the final bytes, not an intermediate form. And `MemoryMiddleware` is placed after profile extras and caching specifically **so that updates to injected memory are less likely to invalidate the cache prefix**. Both are instances of a general constraint: anything that mutates the prompt prefix must be positioned relative to the thing that caches it, or the cache silently stops paying off. That is the kind of coupling that is invisible in a feature list and obvious in an ordered stack.

**Subagent stacks differ in two ways.** Skills run *after* `PatchToolCallsMiddleware` on inner agents rather than before filesystem middleware, and there is **no `SubAgentMiddleware`** inside a subagent graph — only the parent exposes `task`, which is what prevents unbounded recursive delegation by construction.

Custom middleware carries one strong warning: **do not mutate attributes after initialization.** Counters or accumulated values belong in graph state, which is thread-scoped by design and therefore safe under concurrency; mutating `self.x` in a hook races, because subagents, parallel tools, and parallel invocations on different threads all run concurrently.

## Harness profiles

A `HarnessProfile` packages adjustments Deep Agents applies whenever a given provider or model is selected — the main way to tune harness behaviour per model without touching the `create_deep_agent` call site. Built-in profiles ship for OpenAI and Anthropic models. The fields:

- `base_system_prompt` — replace the base prompt outright.
- `system_prompt_suffix` — appended last in the assembled prompt, applied to the main agent, declarative subagents, and the general-purpose subagent.
- `tool_description_overrides` — override individual tool descriptions by name.
- `excluded_tools` — remove harness-level tools, applied as a *post-injection filter* so it can drop both user-supplied tools and tools added by middleware.
- `excluded_middleware` — strip middleware classes from the default stack, by class or by name.
- `extra_middleware` — append middleware to every stack the profile applies to.
- `general_purpose_subagent` — disable, rename, or re-prompt the built-in general-purpose subagent.

Regardless of model, caller-supplied `system_prompt` always sits at the front of the assembled prompt and `system_prompt_suffix` always at the end. Each subagent **re-runs profile resolution against its own model**, so a mixed-model agent tree gets per-node harness tuning automatically.

`FilesystemMiddleware`, `SubAgentMiddleware`, and the internal permission middleware **cannot** be excluded — listing them raises `ValueError`, as they are required scaffolding. To hide their tools from the model without removing the machinery, use `excluded_tools` instead. This is the cleanest statement anywhere in the docs of which parts of the harness are structural rather than optional.

### Keys and merging

Keys are either provider-level (`"openai"`, applying to every model from that provider) or model-level (`"openai:gpt-5.5"`). When both exist they **merge at resolution time**, with unset model-level fields inheriting from the provider level. Re-registering under an existing key merges on top of the prior profile rather than replacing it. Per-field rules: prompts take the new value when set; `tool_description_overrides` merge per key; `excluded_tools`/`excluded_middleware` take the set union; `extra_middleware` merges by name with novel entries appended; `general_purpose_subagent` merges field-wise.

For a preconfigured model *instance* rather than a `provider:model` string, the harness synthesizes a canonical key and looks it up in order: exact `provider:identifier`, then identifier-only (only when the identifier already contains a colon), then provider-only.

**There is no wildcard key.** The docs are explicit that this is intentional: profiles are for adjustments that *depend on which model was selected*, and global adjustments belong at the `create_deep_agent` call site. Applying one override everywhere means registering it under each provider key in use — friction that deliberately steers a design decision rather than merely making it inconvenient.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/customization |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/profiles |
