# Console Context Tab — Design Spec

## Problem

The preamble injected into each agent session via `--append-system-prompt` is not visible in the UI. As context control mechanisms evolve, developers need a way to inspect exactly what context was injected for a given session.

## Goal

Add a "Context" tab to the console pane in `TicketRoute` that shows the injected preamble text for the active (or most recently ended) runtime. The "Console" tab retains the existing terminal view.

## Design

### 1. Data model — `src/shared/runtime.ts`

Add an optional field to `RuntimeSummary`:

```typescript
export interface RuntimeSummary {
  runtimeId: string;
  ticketRef: TicketRef;
  pid: number | null;
  status: RuntimeStatus;
  startedAt: string;
  exitCode?: number;
  errorMessage?: string;
  preamble?: string;   // ← new: text passed as --append-system-prompt
}
```

The field is optional so runtimes spawned before this change (or via older server versions) degrade gracefully.

### 2. Supervisor — `src/runtime/supervisor.ts`

In `spawn()`, the initial `RuntimeSummary` is built from `SpawnInput` fields. `spec.preamble` is available at that point (built by `buildSpawnSpec`). Add it to the summary:

```typescript
const summary: RuntimeSummary = {
  runtimeId: input.runtimeId,
  ticketRef: input.ticketRef,
  pid: pty.pid,
  status: 'starting',
  startedAt: new Date().toISOString(),
  preamble: spec.preamble,   // ← new
};
```

The summary is broadcast in the `runtime-spawned` WebSocket event and stored in the Zustand store; no further changes needed for the preamble to reach the client.

### 3. UI — `src/web/routes/TicketRoute.tsx`

**Tab state** (local, resets on mount, defaults to Console):

```typescript
const [tab, setTab] = useState<'console' | 'context'>('console');
```

**Layout of the console pane** (when `runtime` exists):

```
[ ● ] [ filename ]                    [ session ended? ]
[ Console ] [ Context ]
──────────────────────────────────────────────────────
  <XtermHost>  OR  <preamble text>
```

The existing header row (status dot + filename + "session ended" label) is unchanged. Below it, a tab bar renders two buttons styled as tabs. Below the tab bar, the content area shows:

- **Console tab:** `<XtermHost runtimeId={runtime.runtimeId} />`
- **Context tab:** A scrollable `<pre className="... whitespace-pre-wrap ...">` block showing `runtime.preamble`. If `preamble` is absent, renders a muted "No context available." in its place.

The Context tab button is visually muted (reduced opacity) when `!runtime?.preamble` but remains clickable (showing the "No context available" fallback).

When `runtime` is null the console pane shows the existing empty state unchanged; tabs are not rendered.

## Files Changed

- `src/shared/runtime.ts` — add `preamble?: string` to `RuntimeSummary`
- `src/runtime/supervisor.ts` — populate `preamble` in the initial summary
- `src/web/routes/TicketRoute.tsx` — add tab state, tab bar, Context tab content

## Out of Scope

- Persisting tab selection across navigation
- Showing preamble for runtimes that have already exited and been evicted from the store
- Editing or copying the preamble from the UI (read-only view only)
- Any new API routes or WebSocket event types
