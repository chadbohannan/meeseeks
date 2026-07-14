# Tracing Meeseeks Sessions to LangSmith

This runbook documents a near-term, low-cost integration that is available *without* adopting any other part of the [LangChain ecosystem](../systems/langchain-ecosystem.md): piping the Claude Code sessions Meeseeks already supervises into [LangSmith observability](../concepts/langsmith-observability.md) as structured traces. Because LangSmith's ingestion is [framework-agnostic](../concepts/langsmith-observability.md), this gains Meeseeks structured run inspection — user messages, tool calls, compaction, subagent runs, assistant responses — over sessions it currently only captures as raw terminal bytes in the [console ring buffer](../components/runtime.md). It does not replace any Meeseeks responsibility and does not require switching harnesses.

## What the LangSmith Claude Code plugin does

The tracing setup is a first-party plugin, not a bespoke integration. Per the LangSmith guide (`docs.langchain.com/langsmith/trace-claude-code`), installing it from within Claude Code is three commands against a plugin marketplace:

```
/plugin marketplace add langchain-ai/langsmith-claude-code-plugins
/plugin install langsmith-tracing@langsmith-claude-code-plugins
/reload-plugins
```

The plugin is MIT-licensed and open-source (`github.com/langchain-ai/langsmith-claude-code-plugins`). Once active, each message to Claude Code becomes a **trace**, and all turns from one session are grouped under a shared `thread_id` visible in the project's **Threads** tab — matching the [trace/run/thread data model](../concepts/langsmith-observability.md) exactly. System prompts are *not* captured, because Claude Code does not return them in transcripts.

## The Meeseeks-native injection point

The important detail for this project is that the plugin is configured entirely through environment variables read from Claude Code's `.claude/settings.local.json` `env` block:

```json
{
  "env": {
    "TRACE_TO_LANGSMITH": "true",
    "CC_LANGSMITH_API_KEY": "<LangSmith API key>",
    "CC_LANGSMITH_PROJECT": "meeseeks"
  }
}
```

This maps directly onto machinery Meeseeks already owns. The [Runtime Supervisor](../components/runtime.md) writes a per-runtime `--settings` file per session at `<board>/.meeseeks/session-<runtimeId>.json` (built by `buildSpawnSpec` in `src/runtime/claude-code.ts`, the same seam described in the [Claude Code sandboxing runbook](claude-code-sandboxing.md)). That generated JSON already carries a `hooks` block (and an optional `permissions` block) but no `env` block today — so the change is purely additive: Meeseeks would emit an `env` key alongside the existing `hooks` with the three tracing variables, injecting them without any per-developer shell configuration. An optional `CC_LANGSMITH_METADATA` JSON object attaches custom fields to every run — the natural place to stamp the Meeseeks **ticket ID, board, and lane** onto each trace so a LangSmith project mirrors the [project model](../concepts/project-model.md).

## Nesting traces under a Meeseeks run

Because Meeseeks invokes Claude Code programmatically rather than interactively, it can go one step further than the plugin's default and nest every Claude Code trace under a Meeseeks-owned parent run. Setting `CC_LANGSMITH_PARENT_DOTTED_ORDER` to the `dotted_order` of an outer `traceable` run makes the hierarchy explicit — the docs give a TypeScript example that fits Meeseeks' Node stack:

```ts
import { traceable, getCurrentRunTree } from "langsmith/traceable";

const runTicket = traceable(async (prompt: string) => {
  const runTree = getCurrentRunTree();
  // spawn claude with CC_LANGSMITH_PARENT_DOTTED_ORDER: runTree.dotted_order
}, { name: "meeseeks_ticket" });
```

The resulting trace tree places each `Claude Code Turn` (with its child `Claude` LLM calls and tool runs) beneath the Meeseeks run that launched it — the observability counterpart to the supervisor/child relationship Meeseeks already models.

## Relationship to Meeseeks' existing hooks

This supersedes, rather than duplicates, the hook mechanism Meeseeks leans on today. The [Claude Code client](../systems/claude-code.md) injects `Stop` and `Notification` hooks that fire `curl` at the Meeseeks server to reverse-engineer session state from an un-parseable TUI — and the LangSmith plugin was itself built on exactly that pattern before migrating to a plugin, with the docs' migration note instructing users to remove a manual `~/.claude/hooks/stop_hook.sh`. Meeseeks' hooks serve *supervision* (is the agent waiting?), while the plugin serves *observability* (what did the agent do?); they coexist, but both draw from the same Stop-hook substrate, so a Meeseeks operator should expect them to fire on the same lifecycle events.

## Caveats

- **Subagent runs are traced only on completion.** Interrupting a turn mid-subagent means that subagent's child runs never trace — relevant because Meeseeks' dismiss-without-kill gesture leaves runs executing but a hard cancel would drop in-flight subagent detail.
- **Interrupted runs flush late.** If a run is interrupted in progress, the plugin flushes it only when the next message is sent or the session ends.
- **This is an available integration, not a shipped Meeseeks feature.** Meeseeks does not perform this today; this runbook records how it would be wired given the components Meeseeks already has.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/langsmith/trace-claude-code |
| 2026-07-11 | https://docs.langchain.com/langsmith/observability-concepts |
| 2026-07-11 | `src/runtime/claude-code.ts` (`buildSpawnSpec`: settings-file `hooks` block, `session-<id>.json` path) |
