# Console (MDI panels)

Detachable xterm.js panels rendered on top of the SPA. Each panel is bound to a `runtimeId`; the [runtime supervisor](runtime.md) emits stdio frames that the panel writes to its terminal. Closing a panel is the dismiss-without-kill gesture: the runtime keeps running and reopening replays history from the supervisor's ring buffer (via `GET /api/runtimes/:id/snapshot`).

## State

`store/mdi.ts` (Zustand) holds open panels keyed by runtime — position, size, z-order, minimized flag. `store/runtimes.ts` is the runtime registry; it's hydrated from `runtime-spawned` events on WS reconnect. `store/prompts.ts` mirrors the registry for [one-shot prompt runtimes](../concepts/one-shot-prompts.md) and accumulates streaming output keyed by `runtimeId`. Ambient runtime visibility lives in the [Sidebar](web.md): the lane tree expands to show each active ticket runtime under its state bucket, with a `RuntimeStatusDot` indicating the per-runtime status (running, idle, awaiting-user, etc.).

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
