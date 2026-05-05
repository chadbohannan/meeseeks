# Board Context Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Context" navigation item to the board editor that provides a markdown editor for board-specific CLAUDE.md files.

**Architecture:** Backend adds CLAUDE.md read/write to storage layer and board API. Frontend adds ContextEditor component following existing PROCESS.md editor pattern, with view/edit toggle and auto-save on blur.

**Tech Stack:** TypeScript, Node.js, Fastify, React, React Query, Vitest

---

## File Structure

**Backend:**
- Modify: `src/shared/types.ts` — Add `claudeContent` field to `BoardDetail`
- Modify: `src/shared/api.ts` — Add `claudeContent` field to `PatchBoardRequest`
- Modify: `src/storage/board.ts` — Add `readBoardClaudeContent`, `writeBoardClaudeContent`, update `readBoardDetail`
- Modify: `src/server/routes/boards.ts` — Extend PATCH handler for `claudeContent`
- Test: `tests/storage/board.test.ts` — Add tests for CLAUDE.md read/write
- Test: `tests/server/boards.test.ts` — Add tests for PATCH claudeContent API

**Frontend:**
- Modify: `src/web/routes/BoardEditorRoute.tsx` — Add ContextEditor component, Context nav item, conditional rendering

---

### Task 1: Add Types for Board CLAUDE.md Content

**Files:**
- Modify: `src/shared/types.ts:18-20`
- Modify: `src/shared/api.ts:5`

- [ ] **Step 1: Add claudeContent field to BoardDetail type**

In `src/shared/types.ts`, modify the `BoardDetail` interface:

```typescript
export interface BoardDetail extends BoardSummary {
  lanes: LaneSummary[];
  claudeContent?: string;
}
```

- [ ] **Step 2: Add claudeContent field to PatchBoardRequest**

In `src/shared/api.ts`, modify the `PatchBoardRequest` interface:

```typescript
export interface PatchBoardRequest { name?: string; claudeContent?: string }
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck` (or rely on IDE type checking)
Expected: No type errors

- [ ] **Step 4: Commit type changes**

```bash
git add src/shared/types.ts src/shared/api.ts
git commit -m "feat: add claudeContent field to BoardDetail and PatchBoardRequest types"
```

---

### Task 2: Storage Layer — Read CLAUDE.md Content

**Files:**
- Test: `tests/storage/board.test.ts`
- Modify: `src/storage/board.ts`

- [ ] **Step 1: Write failing test for readBoardClaudeContent**

Add to `tests/storage/board.test.ts` after the existing `readBoardDetail` tests:

```typescript
describe('readBoardClaudeContent', () => {
  it('returns CLAUDE.md content for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');
    
    const { readBoardClaudeContent } = await import('../../src/storage/board.js');
    const content = await readBoardClaudeContent(boardPath);
    
    expect(content).toContain('My Board');
    expect(content).toContain('Board-level instructions');
  });

  it('returns default content when CLAUDE.md is missing', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/missing');
    
    const { readBoardClaudeContent } = await import('../../src/storage/board.js');
    const content = await readBoardClaudeContent(boardPath);
    
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/storage/board.test.ts`
Expected: FAIL with "readBoardClaudeContent is not a function" or similar

- [ ] **Step 3: Import readFile at top of storage/board.ts (if not already imported)**

Verify `readFile` is imported from `node:fs/promises` at the top of `src/storage/board.ts`. It should already be there.

- [ ] **Step 4: Implement readBoardClaudeContent**

Add to `src/storage/board.ts` after the `DEFAULT_CLAUDE_MD` constant:

```typescript
export async function readBoardClaudeContent(boardPath: string): Promise<string> {
  const claudePath = path.join(boardPath, 'CLAUDE.md');
  try {
    return await readFile(claudePath, 'utf8');
  } catch {
    return DEFAULT_CLAUDE_MD('');
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test tests/storage/board.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/storage/board.test.ts src/storage/board.ts
git commit -m "feat(storage): add readBoardClaudeContent function"
```

---

### Task 3: Storage Layer — Write CLAUDE.md Content

**Files:**
- Test: `tests/storage/board.test.ts`
- Modify: `src/storage/board.ts`

- [ ] **Step 1: Write failing test for writeBoardClaudeContent**

Add to `tests/storage/board.test.ts` after the `readBoardClaudeContent` tests:

```typescript
describe('writeBoardClaudeContent', () => {
  it('writes content to CLAUDE.md', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');
    
    const { writeBoardClaudeContent, readBoardClaudeContent } = await import('../../src/storage/board.js');
    const newContent = '# Custom Instructions\n\nTest content';
    await writeBoardClaudeContent(boardPath, newContent);
    
    const readBack = await readBoardClaudeContent(boardPath);
    expect(readBack).toBe(newContent);
  });

  it('overwrites existing CLAUDE.md content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');
    
    const { writeBoardClaudeContent, readBoardClaudeContent } = await import('../../src/storage/board.js');
    
    await writeBoardClaudeContent(boardPath, 'First version');
    const first = await readBoardClaudeContent(boardPath);
    expect(first).toBe('First version');
    
    await writeBoardClaudeContent(boardPath, 'Second version');
    const second = await readBoardClaudeContent(boardPath);
    expect(second).toBe('Second version');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/storage/board.test.ts`
Expected: FAIL with "writeBoardClaudeContent is not a function"

- [ ] **Step 3: Implement writeBoardClaudeContent**

Add to `src/storage/board.ts` after `readBoardClaudeContent`:

```typescript
export async function writeBoardClaudeContent(boardPath: string, content: string): Promise<void> {
  const claudePath = path.join(boardPath, 'CLAUDE.md');
  await writeFile(claudePath, content, 'utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/storage/board.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/storage/board.test.ts src/storage/board.ts
git commit -m "feat(storage): add writeBoardClaudeContent function"
```

---

### Task 4: Storage Layer — Include claudeContent in readBoardDetail

**Files:**
- Test: `tests/storage/board.test.ts`
- Modify: `src/storage/board.ts`

- [ ] **Step 1: Write failing test for claudeContent in readBoardDetail**

Modify the existing test in `tests/storage/board.test.ts` under `describe('readBoardDetail')`:

```typescript
describe('readBoardDetail', () => {
  it('returns lane summaries and claudeContent for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const detail = await readBoardDetail(boardPath, { boardId: 'b', name: 'B' });
    expect(detail.lanes).toEqual([]);
    expect(detail.claudeContent).toBeTruthy();
    expect(detail.claudeContent).toContain('B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/storage/board.test.ts`
Expected: FAIL with assertion error on `claudeContent` (undefined)

- [ ] **Step 3: Modify readBoardDetail to include claudeContent**

In `src/storage/board.ts`, find the `readBoardDetail` function and modify it:

```typescript
export async function readBoardDetail(
  boardPath: string,
  identity: { boardId: string; name: string },
): Promise<BoardDetail> {
  if (!(await exists(boardPath))) {
    throw new NotFoundError(`board not found: ${boardPath}`);
  }
  const lanes = await listLanes(boardPath);
  const claudeContent = await readBoardClaudeContent(boardPath);
  return {
    boardId: identity.boardId,
    name: identity.name,
    path: boardPath,
    available: true,
    lanes,
    claudeContent,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/storage/board.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/storage/board.test.ts src/storage/board.ts
git commit -m "feat(storage): include claudeContent in readBoardDetail"
```

---

### Task 5: API Layer — PATCH Board with claudeContent

**Files:**
- Test: `tests/server/boards.test.ts`
- Modify: `src/server/routes/boards.ts`

- [ ] **Step 1: Write failing test for PATCH claudeContent**

Add to `tests/server/boards.test.ts` (find or create the PATCH board tests section):

```typescript
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('PATCH /api/boards/:boardId with claudeContent', () => {
  it('updates CLAUDE.md content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    
    await request.post('/api/projects/open').send({ path: tp.root });
    const createRes = await request.post('/api/boards').send({ name: 'Test Board' });
    const boardId = createRes.body.board.boardId;
    
    const newContent = '# Updated Instructions\n\nNew content here';
    const patchRes = await request.patch(`/api/boards/${boardId}`)
      .send({ claudeContent: newContent });
    
    expect(patchRes.status).toBe(200);
    
    const getRes = await request.get(`/api/boards/${boardId}`);
    expect(getRes.body.board.claudeContent).toBe(newContent);
  });

  it('persists claudeContent to disk', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    
    await request.post('/api/projects/open').send({ path: tp.root });
    const createRes = await request.post('/api/boards').send({ name: 'Test Board' });
    const boardId = createRes.body.board.boardId;
    
    const newContent = '# Persisted Content\n\nShould write to disk';
    await request.patch(`/api/boards/${boardId}`)
      .send({ claudeContent: newContent });
    
    // Read directly from filesystem to verify persistence
    const boardPath = path.join(tp.root, 'boards/test-board');
    const claudePath = path.join(boardPath, 'CLAUDE.md');
    const diskContent = await readFile(claudePath, 'utf8');
    
    expect(diskContent).toBe(newContent);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/server/boards.test.ts`
Expected: FAIL — claudeContent not updated

- [ ] **Step 3: Import writeBoardClaudeContent in routes/boards.ts**

Add to the imports at the top of `src/server/routes/boards.ts`:

```typescript
import { createBoard, readBoardDetail, renameBoard, deleteBoardFolder, updateBoardName, writeBoardClaudeContent } from '../../storage/board.js';
```

- [ ] **Step 4: Extend PATCH handler to handle claudeContent**

In `src/server/routes/boards.ts`, find the `app.patch<{ Params: { boardId: string }; Body: { name?: string } }>` handler and modify it:

```typescript
app.patch<{ Params: { boardId: string }; Body: { name?: string; claudeContent?: string } }>('/api/boards/:boardId', async (req) => {
  const open = state.require();
  const board = await getBoard(open.meta.path, req.params.boardId);
  if (req.body?.name) {
    const meta = await readProject(open.meta.path);
    const oldEntry = meta.config.boards.find(b => slugifyBoardPath(b) === board.boardId);
    if (oldEntry) {
      const parentDir = path.dirname(oldEntry);
      const newEntry = parentDir === '.' ? slugifyBoardPath(req.body.name) : `${parentDir}/${slugifyBoardPath(req.body.name)}`;
      if (newEntry !== oldEntry) {
        await renameBoard(open.meta.path, oldEntry, newEntry);
      }
      const newAbs = path.isAbsolute(newEntry) ? newEntry : path.resolve(open.meta.path, newEntry);
      await updateBoardName(newAbs, req.body.name);
    }
  }
  if (req.body?.claudeContent !== undefined) {
    await writeBoardClaudeContent(board.path, req.body.claudeContent);
  }
  hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'updated' } });
  return { ok: true };
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test tests/server/boards.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/server/boards.test.ts src/server/routes/boards.ts
git commit -m "feat(api): add claudeContent support to PATCH /api/boards/:boardId"
```

---

### Task 6: Frontend — Add ContextEditor Component

**Files:**
- Modify: `src/web/routes/BoardEditorRoute.tsx`

- [ ] **Step 1: Add ContextEditor component function**

Add after the `StatesEditor` component in `src/web/routes/BoardEditorRoute.tsx` (before the closing of the file):

```typescript
function ContextEditor({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const patchBoard = usePatchBoard(boardId);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const dirty = content !== null;

  if (board.isLoading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!board.data) return <div className="p-6 text-red-400">Board not found.</div>;

  const currentContent = content ?? board.data.board.claudeContent ?? '';

  const save = async () => {
    if (!dirty) return;
    try {
      await patchBoard.mutateAsync({ claudeContent: content! });
      setContent(null);
      toast.success('Context saved');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Board Context</h2>
      <p className="text-sm text-slate-400 mb-4">
        Board-level instructions for agents (CLAUDE.md)
      </p>

      {editing ? (
        <>
          <textarea
            className="w-full bg-slate-800 rounded px-3 py-2 font-mono text-sm resize-none min-h-96"
            value={currentContent}
            onChange={(e) => setContent(e.target.value)}
            onBlur={async () => {
              if (dirty) {
                await save();
              }
              setEditing(false);
            }}
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              className="px-3 py-1 rounded bg-blue-600 text-sm"
              onClick={async () => {
                await save();
                setEditing(false);
              }}
              disabled={!dirty || patchBoard.isPending}
            >
              Save
            </button>
            <button
              className="px-3 py-1 rounded bg-slate-700 text-sm"
              onClick={() => {
                setContent(null);
                setEditing(false);
              }}
            >
              Discard
            </button>
          </div>
        </>
      ) : (
        <div
          className="w-full bg-slate-800 rounded px-3 py-2 min-h-96 overflow-y-auto cursor-pointer hover:ring-1 hover:ring-slate-600"
          onClick={() => {
            setContent(board.data!.board.claudeContent ?? '');
            setEditing(true);
          }}
        >
          <Markdown>{currentContent}</Markdown>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npm run dev` or check IDE type errors
Expected: No compilation errors

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/BoardEditorRoute.tsx
git commit -m "feat(ui): add ContextEditor component"
```

---

### Task 7: Frontend — Add Context Navigation Item

**Files:**
- Modify: `src/web/routes/BoardEditorRoute.tsx`

- [ ] **Step 1: Add Context nav item to sidebar**

In `BoardEditorRoute` function, find the sidebar `<div className="w-72 shrink-0 border-r border-slate-800 overflow-y-auto">` and modify it to add the Context item at the top:

```typescript
<div className="w-72 shrink-0 border-r border-slate-800 overflow-y-auto">
  <div
    className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
      searchParams.get('context') === 'true' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
    }`}
    onClick={() => setSearchParams({ context: 'true' })}
  >
    <span className="text-sm font-medium">Context</span>
  </div>
  {lanes.map((lane) => (
    <LaneListItem
      key={lane.laneName}
      lane={lane}
      selected={selectedLane === lane.laneName}
      onClick={() => setSearchParams({ lane: lane.laneName })}
    />
  ))}
  <div
    className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
      selectedLane === NEW_LANE_KEY ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400'
    }`}
    onClick={() => setSearchParams({ lane: NEW_LANE_KEY })}
  >
    <span className="text-sm">+ New Lane</span>
  </div>
</div>
```

- [ ] **Step 2: Wire up conditional rendering for ContextEditor**

In `BoardEditorRoute`, find the main content area `<div className="flex-1 overflow-y-auto">` and modify the conditional rendering:

```typescript
<div className="flex-1 overflow-y-auto">
  {searchParams.get('context') === 'true' ? (
    <ContextEditor boardId={boardId} />
  ) : selectedLane === NEW_LANE_KEY ? (
    <NewLaneEditor boardId={boardId} onCreated={(name) => setSearchParams({ lane: name })} />
  ) : selectedLane ? (
    <LaneEditor boardId={boardId} laneName={selectedLane} />
  ) : (
    <div className="p-8 text-slate-500">Select a lane to edit its configuration.</div>
  )}
</div>
```

- [ ] **Step 3: Test in browser**

Run: `npm run dev`
Navigate to: `http://localhost:5173/boards/{boardId}/edit`
Expected: See "Context" item at top of sidebar, clicking it shows ContextEditor

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/BoardEditorRoute.tsx
git commit -m "feat(ui): add Context navigation item and wire up ContextEditor rendering"
```

---

### Task 8: Manual End-to-End Testing

**Manual test checklist (no code changes):**

- [ ] **Step 1: Create a new board and verify default CLAUDE.md**

1. Run `npm run dev`
2. Open browser to `http://localhost:5173`
3. Create a new board
4. Navigate to board editor → Click "Context"
5. Verify default template content appears

- [ ] **Step 2: Edit and save content**

1. Click the markdown content to enter edit mode
2. Modify the content
3. Click Save button
4. Verify toast notification "Context saved"
5. Refresh the page
6. Click "Context" again
7. Verify saved content persists

- [ ] **Step 3: Test blur save behavior**

1. Click the content to edit
2. Make changes
3. Click a lane name (navigate away)
4. Navigate back to Context
5. Verify changes were saved

- [ ] **Step 4: Test discard behavior**

1. Click to edit
2. Make changes
3. Click Discard button
4. Verify changes are reverted

- [ ] **Step 5: Test error handling**

1. Stop the server (simulate network error)
2. Try to save changes
3. Verify error toast appears
4. Restart server and verify retry works

- [ ] **Step 6: Document test results**

Create a quick summary of test results in commit message or PR description.

---

## Implementation Complete

All tasks completed! The board context editor feature is now fully implemented with:
- Backend storage functions for reading/writing CLAUDE.md
- API endpoint supporting claudeContent PATCH
- Frontend ContextEditor component with view/edit modes
- Context navigation item in board editor sidebar
- Auto-save on blur and explicit save/discard buttons
- Full test coverage for storage and API layers
