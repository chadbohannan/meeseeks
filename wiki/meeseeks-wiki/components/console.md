# Console (MDI panels)

Detachable xterm.js panels rendered on top of the SPA. Each panel is bound to a `runtimeId`; the [runtime supervisor](runtime.md) emits stdio frames that the panel writes to its terminal. Closing a panel is the dismiss-without-kill gesture: the runtime keeps running and reopening replays history from the supervisor's ring buffer (via `GET /api/runtimes/:id/snapshot`). This gesture has an exact analog in LangChain's frontend SDK, where `stream.disconnect()` leaves a run executing server-side while a remount reattaches to it — the mapping is drawn out in [LangChain frontend rendering](../concepts/langchain-frontend-rendering.md), which notes the SDK version recovers full checkpointed state rather than a lossy buffer replay. A second analog sits closer to home: [Claude Code](../systems/claude-code.md#capability-surface)'s `/background` (`/bg`) detaches a session to run as a background agent and frees the terminal, which is the same gesture implemented inside the harness Meeseeks already supervises — so this is a capability Meeseeks rebuilds at the panel layer rather than one that exists only there. That the gesture needs engineering at all is a consequence of the panel *being* the session rather than a view onto one; the [attention-economics synthesis](../syntheses/attention-economics.md) argues durable sessions would make dismiss-without-kill unremarkable, since detaching from an object that outlives its viewer carries no ambient risk to reassure against.

## State

`store/mdi.ts` (Zustand) holds open panels keyed by runtime — position, size, z-order, minimized flag. `store/runtimes.ts` is the runtime registry; it's hydrated from `runtime-spawned` events on WS reconnect. `store/prompts.ts` mirrors the registry for [one-shot prompt runtimes](../concepts/one-shot-prompts.md) and accumulates streaming output keyed by `runtimeId`. Ambient runtime visibility lives in the [Sidebar](web.md): the lane tree expands to show each active ticket runtime under its state bucket, with a `RuntimeStatusDot` indicating the per-runtime status (running, idle, awaiting-user, etc.). The dot is Meeseeks' whole attention-routing surface, and its resolution is the enum's: it can show that an agent is `running` but not whether that agent is progressing or thrashing — the blind spot [attention economics](../syntheses/attention-economics.md) identifies as the one observability would close.

The `Dock.tsx` component is rendered in `AppShell` and surfaces every active one-shot runtime as a button — clicking re-opens its `PromptRunModal`. Interactive ticket consoles are not surfaced through the Dock; they attach to tickets directly and are presented as MDI panels driven by `store/mdi.ts`.

## Stdio path

`hooks/use-runtime-ws.ts` subscribes to the WS singleton, decodes base64 `runtime-stdio` frames into `Uint8Array`, and fans them out to whichever `XtermHost` is currently mounted. Keystrokes flow back via `runtime-input` frames; `xterm-addon-fit` triggers `runtime-resize` on viewport changes.

## Scope

This slice has no resize handle on the panels (only drag); only one panel per runtime; no persistence across page reload. Listed as future work.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/web/components/console/` |
| 2026-05-02 | `src/web/components/console/Dock.tsx`, `PromptRunModal.tsx`, `AppShell.tsx` |
