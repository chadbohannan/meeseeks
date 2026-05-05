# Board Context Editor Design

## Overview

Add a "Context" navigation item to the board editor sidebar that provides access to a markdown editor for the board-specific CLAUDE.md file. This allows users to configure board-level agent instructions directly from the UI.

## Background

Each board already has a CLAUDE.md file created during board initialization (see `src/storage/board.ts:51`). This file contains board-level instructions for agents. Currently, this file must be edited outside the web UI. The board editor already provides in-UI editing for lane PROCESS.md files, and this feature extends that pattern to the board's CLAUDE.md.

## User Flow

1. User opens board editor at `/boards/:boardId/edit`
2. User sees "Context" navigation item at the top of the lane sidebar
3. User clicks "Context" → URL updates to `/boards/:boardId/edit?context=true`
4. Main content area shows the ContextEditor component
5. User clicks the markdown content → enters edit mode (textarea)
6. User clicks away or navigates → content saves via PATCH API call
7. User clicks a lane → saves pending context edits before navigation

## Architecture

### Frontend Changes

**BoardEditorRoute.tsx modifications:**

Add a "Context" navigation item above the lane list in the sidebar:
```tsx
<div className="w-72 shrink-0 border-r border-slate-800 overflow-y-auto">
  <div /* Context nav item */ onClick={() => setSearchParams({ context: 'true' })} />
  {lanes.map((lane) => <LaneListItem ... />)}
  <div /* + New Lane */ onClick={() => setSearchParams({ lane: NEW_LANE_KEY })} />
</div>
```

Extend the main content area conditional rendering:
```tsx
{searchParams.get('context') === 'true' ? (
  <ContextEditor boardId={boardId} />
) : selectedLane === NEW_LANE_KEY ? (
  <NewLaneEditor ... />
) : selectedLane ? (
  <LaneEditor ... />
) : (
  <div>Select a lane to edit...</div>
)}
```

**ContextEditor component:**

A new component following the same pattern as the PROCESS.md editor in LaneEditor (lines 308-357):
- Local state: `editing` (boolean), `content` (string | null), `dirty` (boolean)
- Two modes:
  - **View mode**: Rendered markdown in a clickable container with hover ring
  - **Edit mode**: Textarea with monospace font
- Data flow:
  - Load from `board.data.board.claudeContent` (new field)
  - On blur: if dirty, call `patchBoard.mutateAsync({ claudeContent })`
  - Save/Discard buttons for explicit control
- Styling: matches existing editor components (slate-800 background, rounded borders)

### Backend Changes

**Type additions (shared/types.ts):**

Add `claudeContent?: string` to the `BoardDetail` type and `BoardSummary` type.

**Storage layer (storage/board.ts):**

Add a new function:
```typescript
export async function readBoardClaudeContent(boardPath: string): Promise<string> {
  const claudePath = path.join(boardPath, 'CLAUDE.md');
  try {
    return await readFile(claudePath, 'utf8');
  } catch {
    return DEFAULT_CLAUDE_MD(''); // fallback
  }
}

export async function writeBoardClaudeContent(boardPath: string, content: string): Promise<void> {
  const claudePath = path.join(boardPath, 'CLAUDE.md');
  await writeFile(claudePath, content, 'utf8');
}
```

Modify `readBoardDetail` to include `claudeContent`:
```typescript
export async function readBoardDetail(...): Promise<BoardDetail> {
  // ... existing code ...
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

**API layer (server/routes/boards.ts):**

Extend the PATCH `/api/boards/:boardId` handler to accept `claudeContent`:
```typescript
app.patch<{ Params: { boardId: string }; Body: { name?: string; claudeContent?: string } }>(
  '/api/boards/:boardId',
  async (req) => {
    // ... existing name update logic ...
    
    if (req.body?.claudeContent !== undefined) {
      await writeBoardClaudeContent(board.path, req.body.claudeContent);
    }
    
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'updated' } });
    return { ok: true };
  }
);
```

**Query hooks (web/hooks/queries.ts):**

The existing `usePatchBoard` hook should already support the new `claudeContent` field via the generic PATCH body type. Verify the mutation key invalidation triggers re-fetch of board detail.

## Data Flow

1. **Load**: GET `/api/boards/:boardId` → backend reads CLAUDE.md → returns `board.claudeContent`
2. **Edit**: User edits in textarea → local state `content` updates
3. **Save**: On blur or explicit save → PATCH `/api/boards/:boardId` with `{ claudeContent }` → backend writes to CLAUDE.md
4. **Invalidate**: React Query invalidates board cache → re-fetches → UI shows updated content

## Edge Cases

**Navigation with unsaved changes:**
Before changing `searchParams` (e.g., clicking a lane), the ContextEditor should flush pending changes via its blur handler. Since the component unmounts, rely on the blur event firing before unmount, or add an explicit save-before-unmount effect.

**Concurrent edits:**
If CLAUDE.md is edited outside the UI while the editor is open, the UI shows stale content until the user navigates away and back. This matches the existing behavior for PROCESS.md and ticket body editors (no live file watching in edit mode).

**Empty CLAUDE.md:**
If the file is missing or empty, show the default template content from `DEFAULT_CLAUDE_MD(boardName)` as a starting point.

**API errors:**
Toast error messages on save failure (matching existing pattern). Keep dirty state so user can retry.

## UI Consistency

The ContextEditor matches the visual style of:
- Ticket body editor (TicketRoute.tsx lines 148-163)
- PROCESS.md editor (BoardEditorRoute.tsx lines 308-357)

Consistent styling:
- Container: `bg-slate-800 rounded px-3 py-2`
- Textarea: `font-mono text-sm resize-none`
- Hover ring in view mode: `hover:ring-1 hover:ring-slate-600`
- Save button: `bg-blue-600`
- Discard button: `bg-slate-700`

## Testing Considerations

Manual testing checklist:
1. Navigate to Context editor → verify CLAUDE.md content loads
2. Edit content → verify textarea appears
3. Save → verify PATCH request succeeds and content persists
4. Navigate to lane → verify context editor content saves on blur
5. Reload page → verify saved content appears
6. Create new board → verify default CLAUDE.md template shows
7. Test error handling → verify toast on API failure

No automated tests required initially (UI components don't have test coverage yet).

## Implementation Order

1. Add `claudeContent` field to `BoardDetail` type
2. Implement `readBoardClaudeContent` and `writeBoardClaudeContent` in storage layer
3. Modify `readBoardDetail` to include claudeContent
4. Extend PATCH `/api/boards/:boardId` to handle claudeContent updates
5. Create `ContextEditor` component in `BoardEditorRoute.tsx`
6. Add "Context" navigation item to sidebar
7. Wire up conditional rendering in main content area
8. Test end-to-end flow

## Open Questions

None - design is complete and approved.
