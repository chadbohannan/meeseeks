# Console (MDI panels)

Detachable xterm.js panels rendered on top of the SPA. Each panel is bound to a `runtimeId`; the [runtime supervisor](runtime.md) emits stdio frames that the panel writes to its terminal. Closing a panel is the dismiss-without-kill gesture: the runtime keeps running and reopening replays history from the supervisor's ring buffer (via `GET /api/runtimes/:id/snapshot`).

## State

`store/mdi.ts` (Zustand) holds open panels keyed by runtime — position, size, z-order, minimized flag. `store/runtimes.ts` is the runtime registry; it's hydrated from `runtime-spawned` events on WS reconnect. Ambient runtime visibility lives in the [Sidebar](web.md): each lane node shows a green dot when any of its runtimes is active, and an amber yield sign when one is `awaiting-user`. The `Dock.tsx` component still exists in the source tree but is not rendered — the bottom dock bar was removed (commit `e50943e`).

## Stdio path

`hooks/use-runtime-ws.ts` subscribes to the WS singleton, decodes base64 `runtime-stdio` frames into `Uint8Array`, and fans them out to whichever `XtermHost` is currently mounted. Keystrokes flow back via `runtime-input` frames; `xterm-addon-fit` triggers `runtime-resize` on viewport changes.

## Scope

This slice has no resize handle on the panels (only drag); only one panel per runtime; no persistence across page reload. Listed as future work.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/web/components/console/` |
