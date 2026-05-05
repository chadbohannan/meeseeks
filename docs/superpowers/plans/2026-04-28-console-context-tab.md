# Console Context Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Context" tab to the ticket console pane that shows the preamble text injected into each agent session via `--append-system-prompt`.

**Architecture:** Add `preamble?: string` to `RuntimeSummary` (shared type) and populate it in the supervisor at spawn time so it flows through the existing WebSocket `runtime-spawned` event into the Zustand store. The UI adds a two-tab bar ("Console" / "Context") above the content area of the console pane; the Context tab renders the preamble as preformatted text.

**Tech Stack:** TypeScript, React, Zustand, Vitest

---

### Task 1: Add `preamble` to `RuntimeSummary` and populate it in the supervisor

**Files:**
- Modify: `src/shared/runtime.ts`
- Modify: `src/runtime/supervisor.ts`
- Test: `tests/runtime/supervisor.test.ts`

- [ ] **Step 1: Add `preamble?: string` to `RuntimeSummary`**

  Open `src/shared/runtime.ts`. The current interface is:

  ```typescript
  export interface RuntimeSummary {
    runtimeId: string;
    ticketRef: TicketRef;
    pid: number | null;
    status: RuntimeStatus;
    startedAt: string;
    exitCode?: number;
    errorMessage?: string;
  }
  ```

  Replace with:

  ```typescript
  export interface RuntimeSummary {
    runtimeId: string;
    ticketRef: TicketRef;
    pid: number | null;
    status: RuntimeStatus;
    startedAt: string;
    exitCode?: number;
    errorMessage?: string;
    preamble?: string;
  }
  ```

- [ ] **Step 2: Write a failing test for preamble in the spawned summary**

  Open `tests/runtime/supervisor.test.ts`. Add this test inside the `describe('RuntimeSupervisor', ...)` block (after the existing tests):

  ```typescript
  it('includes preamble in the summary returned by spawn', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    const summary = await sup.spawn({
      runtimeId: 'rt-preamble',
      boardPath: tmp,
      lanePath: path.join(tmp, 'lane'),
      ticketAbsPath: path.join(tmp, 'lane', 'todo', 'my-ticket.md'),
      processDocPath: null,
      ticketRef: { boardId: 'b', laneName: 'lane', filename: 'my-ticket.md' },
      board: null,
      permissions: null,
      adapterArgsOverride: ['--scripted=init,result'],
    });
    expect(summary.preamble).toBeTruthy();
    expect(summary.preamble).toContain('my-ticket.md');
    expect(summary.preamble).toContain('lane');
    await sup.terminateAll();
  });
  ```

- [ ] **Step 3: Run the test to confirm it fails**

  ```bash
  npm test -- --reporter=verbose 2>&1 | grep -A5 "preamble"
  ```

  Expected: test fails because `summary.preamble` is `undefined`.

- [ ] **Step 4: Populate `preamble` in `supervisor.spawn()`**

  Open `src/runtime/supervisor.ts`. There are two `RuntimeSummary` object literals in `spawn()`:

  **First** (the error path, around line 114 — when `spawnFn` throws):

  ```typescript
  const summary: RuntimeSummary = {
    runtimeId: input.runtimeId,
    ticketRef: input.ticketRef,
    pid: null,
    status: 'errored',
    startedAt: new Date().toISOString(),
    errorMessage,
  };
  ```

  Replace with:

  ```typescript
  const summary: RuntimeSummary = {
    runtimeId: input.runtimeId,
    ticketRef: input.ticketRef,
    pid: null,
    status: 'errored',
    startedAt: new Date().toISOString(),
    errorMessage,
    preamble: spec.preamble,
  };
  ```

  **Second** (the happy path, around line 128 — after a successful pty spawn):

  ```typescript
  const summary: RuntimeSummary = {
    runtimeId: input.runtimeId,
    ticketRef: input.ticketRef,
    pid: pty.pid,
    status: 'starting',
    startedAt: new Date().toISOString(),
  };
  ```

  Replace with:

  ```typescript
  const summary: RuntimeSummary = {
    runtimeId: input.runtimeId,
    ticketRef: input.ticketRef,
    pid: pty.pid,
    status: 'starting',
    startedAt: new Date().toISOString(),
    preamble: spec.preamble,
  };
  ```

- [ ] **Step 5: Run all tests to confirm they pass**

  ```bash
  npm test
  ```

  Expected: all 77 tests pass (76 existing + the new preamble test).

- [ ] **Step 6: Commit**

  ```bash
  git add src/shared/runtime.ts src/runtime/supervisor.ts tests/runtime/supervisor.test.ts
  git commit -m "feat: include preamble in RuntimeSummary so client can display injected context"
  ```

---

### Task 2: Add tabbed Console / Context UI to the ticket console pane

**Files:**
- Modify: `src/web/routes/TicketRoute.tsx`

- [ ] **Step 1: Read the current file**

  Open `src/web/routes/TicketRoute.tsx` and locate:
  1. The imports at the top (line 1)
  2. The `useState` call for existing state (around line 24–28)
  3. The `consolePane` constant (around line 152–173)

- [ ] **Step 2: Add tab state**

  The file already imports `useState` from React (line 1). After the existing state declarations (after `const [editing, setEditing] = useState(false);`), add:

  ```typescript
  const [tab, setTab] = useState<'console' | 'context'>('console');
  ```

- [ ] **Step 3: Replace the `consolePane` constant**

  The current `consolePane` block is:

  ```tsx
  const consolePane = (
    <div className="flex flex-col h-full bg-black">
      {runtime ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-sm shrink-0">
            <RuntimeStatusDot status={runtime.status} />
            <span className="font-mono text-xs">{runtime.ticketRef.filename}</span>
            {(runtime.status === 'exited' || runtime.status === 'errored' || runtime.status === 'terminating') && (
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

  Replace it with:

  ```tsx
  const consolePane = (
    <div className="flex flex-col h-full bg-black">
      {runtime ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-sm shrink-0">
            <RuntimeStatusDot status={runtime.status} />
            <span className="font-mono text-xs">{runtime.ticketRef.filename}</span>
            {(runtime.status === 'exited' || runtime.status === 'errored' || runtime.status === 'terminating') && (
              <span className="ml-auto text-xs text-slate-500">session ended</span>
            )}
          </div>
          <div className="flex gap-1 px-2 pt-1 bg-slate-900 shrink-0">
            <button
              className={`px-3 py-1 text-xs rounded-t ${tab === 'console' ? 'bg-black text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setTab('console')}
            >Console</button>
            <button
              className={`px-3 py-1 text-xs rounded-t ${tab === 'context' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setTab('context')}
            >Context</button>
          </div>
          <div className="flex-1 min-h-0">
            {tab === 'console' ? (
              <div className="h-full p-1">
                <XtermHost runtimeId={runtime.runtimeId} />
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-4">
                {runtime.preamble ? (
                  <pre className="text-slate-300 text-xs whitespace-pre-wrap font-mono">{runtime.preamble}</pre>
                ) : (
                  <span className="text-slate-500 text-sm">No context available.</span>
                )}
              </div>
            )}
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

- [ ] **Step 4: Run all tests to confirm nothing broke**

  ```bash
  npm test
  ```

  Expected: all 77 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/web/routes/TicketRoute.tsx
  git commit -m "feat: add Context tab to console pane showing injected agent preamble"
  ```
