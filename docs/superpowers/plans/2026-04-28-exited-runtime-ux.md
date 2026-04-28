# Exited Runtime UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a Claude Code session ends, the Spawn button reappears and the terminal buffer stays visible until a new session starts.

**Architecture:** Two changes — (1) `TicketRoute` derives an `activeRuntime` (non-exited/errored) separately from the display `runtime`, driving button visibility independently of terminal visibility; (2) `use-runtime-ws.ts` evicts stale dead runtimes for a ticket from the store the moment a new `runtime-spawned` event arrives, causing `XtermHost` to unmount/remount on the new `runtimeId`.

**Tech Stack:** React, Zustand, xterm.js, TypeScript

---

### Task 1: Update `use-runtime-ws.ts` — evict dead runtimes on new spawn

**Files:**
- Modify: `src/web/hooks/use-runtime-ws.ts`

- [ ] **Step 1: Read the current file**

  Open `src/web/hooks/use-runtime-ws.ts` and confirm it looks like:

  ```typescript
  if (evt.type === 'runtime-spawned') {
    useRuntimesStore.getState().upsert(evt.payload);
    qc.invalidateQueries({ queryKey: ['runtimes'] });
  }
  ```

- [ ] **Step 2: Replace the `runtime-spawned` handler with eviction + upsert**

  Replace the block above with:

  ```typescript
  if (evt.type === 'runtime-spawned') {
    const store = useRuntimesStore.getState();
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
    qc.invalidateQueries({ queryKey: ['runtimes'] });
  }
  ```

- [ ] **Step 3: Verify tests pass**

  ```bash
  npm test
  ```

  Expected: all tests pass (no runtime-ws unit tests exist; the change is covered by integration observation).

- [ ] **Step 4: Commit**

  ```bash
  git add src/web/hooks/use-runtime-ws.ts
  git commit -m "fix: evict dead runtimes from store when new session spawns for same ticket"
  ```

---

### Task 2: Update `TicketRoute.tsx` — Spawn button, Terminate button, console pane

**Files:**
- Modify: `src/web/routes/TicketRoute.tsx`

- [ ] **Step 1: Derive `activeRuntime` from the existing `runtime` selector**

  Directly after the existing `runtime` selector (around line 20–22):

  ```typescript
  const runtime = useRuntimesStore((s) =>
    Object.values(s.byId).find(r =>
      r.ticketRef.boardId === boardId && r.ticketRef.laneName === laneName && r.ticketRef.filename === filename));
  ```

  Add one line immediately after:

  ```typescript
  const activeRuntime = runtime?.status === 'exited' || runtime?.status === 'errored' ? null : runtime ?? null;
  ```

- [ ] **Step 2: Update the editor-pane runtime status row**

  The current block (lines 68–93) reads:

  ```tsx
  <div className="flex items-center gap-2 mb-3 shrink-0">
    {runtime ? (
      <>
        <RuntimeStatusDot status={runtime.status} />
        <span className="text-sm">{runtime.status}</span>
        {(runtime.status === 'running' || runtime.status === 'idle' || runtime.status === 'starting') && (
          <button
            className="rounded bg-red-700 px-3 py-1 text-sm"
            onClick={async () => {
              if (!confirm('Terminate runtime?')) return;
              try { await term.mutateAsync(runtime.runtimeId); }
              catch (err) { toast.error((err as Error).message); }
            }}
          >Terminate</button>
        )}
      </>
    ) : (
      <button
        className="rounded bg-emerald-700 px-3 py-1 text-sm"
        onClick={async () => {
          try {
            await spawn.mutateAsync({ boardId, laneName, filename });
          } catch (err) { toast.error((err as Error).message); }
        }}
      >Spawn runtime</button>
    )}
  </div>
  ```

  Replace with:

  ```tsx
  <div className="flex items-center gap-2 mb-3 shrink-0">
    {activeRuntime ? (
      <>
        <RuntimeStatusDot status={activeRuntime.status} />
        <span className="text-sm">{activeRuntime.status}</span>
        {(activeRuntime.status === 'running' || activeRuntime.status === 'idle' || activeRuntime.status === 'starting') && (
          <button
            className="rounded bg-red-700 px-3 py-1 text-sm"
            onClick={async () => {
              if (!confirm('Terminate runtime?')) return;
              try { await term.mutateAsync(activeRuntime.runtimeId); }
              catch (err) { toast.error((err as Error).message); }
            }}
          >Terminate</button>
        )}
      </>
    ) : (
      <button
        className="rounded bg-emerald-700 px-3 py-1 text-sm"
        onClick={async () => {
          try {
            await spawn.mutateAsync({ boardId, laneName, filename });
          } catch (err) { toast.error((err as Error).message); }
        }}
      >Spawn agent</button>
    )}
  </div>
  ```

  Note the button label changes from "Spawn runtime" to "Spawn agent" — this is the "one at a time, not one ever" language clarification.

- [ ] **Step 3: Update the console pane**

  The current `consolePane` block (lines 147–165) reads:

  ```tsx
  const consolePane = (
    <div className="flex flex-col h-full bg-black">
      {runtime ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-sm shrink-0">
            <RuntimeStatusDot status={runtime.status} />
            <span className="font-mono text-xs">{runtime.ticketRef.filename}</span>
          </div>
          <div className="flex-1 min-h-0 p-1">
            <XtermHost runtimeId={runtime.runtimeId} />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          No runtime active. Spawn one to see the console here.
        </div>
      )}
    </div>
  );
  ```

  Replace with:

  ```tsx
  const consolePane = (
    <div className="flex flex-col h-full bg-black">
      {runtime ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-sm shrink-0">
            <RuntimeStatusDot status={runtime.status} />
            <span className="font-mono text-xs">{runtime.ticketRef.filename}</span>
            {(runtime.status === 'exited' || runtime.status === 'errored') && (
              <span className="ml-auto text-xs text-slate-500">session ended</span>
            )}
          </div>
          <div className="flex-1 min-h-0 p-1">
            <XtermHost runtimeId={runtime.runtimeId} />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          No agent running. Spawn one to see the console here.
        </div>
      )}
    </div>
  );
  ```

- [ ] **Step 4: Verify tests pass**

  ```bash
  npm test
  ```

  Expected: all 76 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/web/routes/TicketRoute.tsx
  git commit -m "fix: restore spawn button after session exits, keep terminal buffer until new session"
  ```
