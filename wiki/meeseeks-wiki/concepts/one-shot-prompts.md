# One-Shot Prompts

One-shot prompts are a second runtime kind alongside ticket runtimes: a board-scoped library of reusable prompt bodies that can be fired at Claude Code in non-interactive `--print` mode and have their output captured to a per-prompt run log. Where a [ticket runtime](runtime.md) is a long-lived interactive PTY session bound to a specific ticket, a prompt runtime is a short-lived child process that runs the prompt body against the board and exits. The two share the same `RuntimeSupervisor`, ring buffer, stream-json parser, settings-file lifecycle, and termination semantics — they diverge only in spawn shape and lifecycle wiring.

## Storage

Prompt bodies live as Markdown files under `<board>/prompts/*.md`. Filenames are slugified at creation time (`slugify` in `src/web/components/PromptsEditor.tsx`) — display names like "Weekly Report" become `weekly-report.md`. Run history is appended as JSON Lines under `<board>/prompts/.logs/<slug>/runs.jsonl`, one entry per completed run. Each entry records `runtimeId`, `startedAt`, `exitedAt`, terminal `status` (`exited` or `errored`), optional `errorMessage`, and the accumulated assistant `output`. The `.logs/` directory is excluded from the prompt list because the lister filters to `*.md` files. Note the path divergence from the generic file API: prompts are *not* under `<board>/.claude/prompts/`. The `NAMESPACE_DIRS` table in `src/server/routes/files.ts` reserves that path but does not yet expose it; `prompts` is a sibling top-level board directory served by a dedicated route module.

## Spawn shape

The adapter `buildPromptSpawnSpec` in `src/runtime/claude-code.ts` differs from the ticket adapter in three ways. It passes `--print --output-format stream-json --verbose`, so the harness runs non-interactively and emits the structured event stream the [`StreamParser`](../components/runtime.md) was designed for. It passes the prompt body as a positional argv argument (not via `--append-system-prompt`), making the body the user turn rather than a system instruction. And it does not generate the `Stop`/`Notification` hooks that ticket runtimes rely on — those are only meaningful in interactive mode where the agent loops between turns. In one-shot mode the agent runs one turn and exits, so lifecycle is driven entirely by the parser (`init` or `turn-start` → `running`) and the child process exit (`exited` if exit code 0, otherwise `errored`).

The supervisor's `spawnPrompt` method in `src/runtime/supervisor.ts` uses Node's `child_process.spawn` with piped stdio rather than `node-pty`. To preserve a uniform internal interface, it wraps the `ChildProcess` in a `PtyLike` shim whose `write` and `resize` are no-ops and whose `onExit` proxies `child.on('exit', ...)`. This keeps the `Runtime` record uniform across kinds at the cost of a small lie — prompt runtimes ignore PTY input and resize calls entirely, but `writeInput` and `resize` will silently succeed against the shim. WebSocket clients filter on `runtime.kind === 'prompt'` to avoid sending input.

## Run logging

The HTTP route `POST /api/boards/:boardId/prompts/:name/run` (in `src/server/routes/prompts.ts`) attaches a pair of supervisor listeners — `runtime-message` and `runtime-status` — for the duration of the run, accumulates `message-text` events into a string, and on `exited`/`errored` writes a single JSONL entry via `appendRunLog` and detaches the listeners. This places persistence in the request handler rather than the supervisor, with two consequences worth knowing: the captured `output` is assistant prose plus the final `result` summary string (no tool-use blocks, no thinking blocks, no stderr — but the `result` JSON object is emitted as `message-text` by `StreamParser` and therefore *is* accumulated), and a server crash mid-run loses the entry because the listener pair lives in handler closure rather than a startup-registered subscriber. These are deliberate simplifications for the first slice; promoting log persistence into a supervisor-level subscriber and broadening the captured event set would close both gaps.

`stderr` from the child is currently piped into both the ring buffer and the stream-json parser. The parser tolerates non-JSON lines silently, but spurious stderr can theoretically pollute parse state — keep this in mind if a prompt run shows missing transitions.

## Single-instance guard

Before spawning, the run route checks `state.supervisor.list()` for an existing prompt runtime with matching `boardId` and `name` whose status is not terminal, and rejects with `ConflictError` if found. This prevents accidental double-fire from a UI double-click but does not prevent two different prompts running simultaneously, nor does it serialize a prompt against its own ticket runtimes — the namespaces are independent.

## UI surface

The Board Editor exposes prompts as a top-level navigation item ("One-Shot Prompts") above the CLAUDE.md, `.claude/skills`, `.claude/bin`, and lane entries (`src/web/routes/BoardEditorRoute.tsx`). The `PromptsEditor` shows a file list on the left and a tabbed editor on the right with two tabs: the markdown body editor and the run log. The editor offers a model selector (Sonnet 4.6, Opus 4.7, Haiku 4.5) and a Start button. Once a run is live, the Start button becomes Open, which raises a `PromptRunModal` — a streaming output view rendered from the runtime store rather than from a re-attach snapshot. The modal is the consumer of the WebSocket `runtime-stdio` frames for prompt kinds. The [Dock](../components/console.md) in `AppShell` surfaces every active one-shot runtime as a button that re-opens its modal — interactive ticket consoles attach to tickets directly as MDI panels and are not surfaced through the Dock.

The body editor uses the same focus-stable initialization pattern as `TicketRoute` — once mounted it owns the editor state and refetches do not overwrite in-progress edits. This means filesystem changes to the prompt body made outside the app while the editor is open will not appear until the editor remounts.

## Relation to deferred non-interactive work

The `--print`-mode path was previously called out in [components/runtime.md](../components/runtime.md) as load-bearing for autonomous triggers and scripted runs that had not yet been built. One-shot prompts are the first concrete consumer of that path. The state-transition semantics described there (parser-driven, no hooks needed) now have a live implementation; the autonomous-trigger feature listed in [architecture-overview.md](../syntheses/architecture-overview.md) as deferred remains unimplemented but can build on the same `spawnPrompt` plumbing.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-05-02 | `src/runtime/supervisor.ts` (`spawnPrompt`) |
| 2026-05-02 | `src/runtime/claude-code.ts` (`buildPromptSpawnSpec`) |
| 2026-05-02 | `src/storage/prompts.ts` |
| 2026-05-02 | `src/server/routes/prompts.ts` |
| 2026-05-02 | `src/web/components/PromptsEditor.tsx` |
| 2026-05-02 | `src/web/components/console/PromptRunModal.tsx` |
| 2026-05-02 | commit `32c8f2b` "implemented one-shot agents" |
