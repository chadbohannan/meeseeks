# Exited Runtime UX — Design Spec

## Problem

When a Claude Code session ends, the runtime record stays in the Zustand store with status `'exited'` or `'errored'`. The `TicketRoute` component derives the Spawn button's visibility from `!runtime`, so once any runtime has ever existed for a ticket the Spawn button disappears permanently (for that browser session). The console pane shows the old `XtermHost` indefinitely. There is no way to start a new session without refreshing the page.

## Goal

- After exit: Spawn button reappears; terminal output (ring buffer) remains visible.
- After new session starts: terminal resets to the new session's output.
- One active session per ticket at a time; the UI makes clear this is a "one at a time" constraint, not a "one ever" constraint.

## Design

### 1. Spawn button condition (`TicketRoute.tsx`)

Change the condition that hides the Spawn button from `runtime` to `activeRuntime`:

```
const activeRuntime = runtime && !['exited', 'errored'].includes(runtime.status)
  ? runtime : null;
```

- Spawn button renders when `!activeRuntime`.
- Terminate button renders when `activeRuntime.status` is `'starting' | 'idle' | 'running'`.
- The console pane renders `XtermHost` whenever `runtime` exists (including exited), falling back to the empty-state message only when `runtime` is null.

### 2. Store eviction on new spawn (`use-runtime-ws.ts`)

When a `runtime-spawned` event arrives, remove any existing exited/errored entries for the same ticket before upserting the new one:

```typescript
if (evt.type === 'runtime-spawned') {
  const store = useRuntimesStore.getState();
  // evict stale dead runtimes for this ticket
  Object.values(store.byId).forEach(r => {
    if (
      r.ticketRef.boardId === evt.payload.ticketRef.boardId &&
      r.ticketRef.laneName === evt.payload.ticketRef.laneName &&
      r.ticketRef.filename === evt.payload.ticketRef.filename &&
      (r.status === 'exited' || r.status === 'errored')
    ) {
      store.remove(r.runtimeId);
    }
  });
  store.upsert(evt.payload);
  ...
}
```

This causes `XtermHost` to unmount and remount with the new `runtimeId` at the exact moment the new session begins — matching the spec "persist until the next agent instance starts running."

### 3. Console pane header for exited state

When `runtime.status` is `'exited'` or `'errored'`, show a muted "Session ended" label in the console header alongside the status dot, so the user understands the output is historical.

## Files Changed

- `src/web/routes/TicketRoute.tsx` — Spawn/Terminate button conditions, console pane render logic
- `src/web/hooks/use-runtime-ws.ts` — eviction logic on `runtime-spawned`

## Out of Scope

- Persisting the ring buffer across page refresh (server already holds it; the `getRuntimeSnapshot` call on `XtermHost` mount already replays it)
- Any changes to the server or store structure
