# Skills Editor Design

## Overview

Add a `.claude/skills` editor to the board editor interface, enabling users to create, view, and edit Claude Code skill files directly from the Meeseeks web UI. The editor will use a generic file API architecture that can be reused for other board-level file management features (wiki browser, prompts, hooks).

## Context

The board editor currently has a CLAUDE.md context editor. Users need a way to manage board-specific skills without leaving the Meeseeks interface. This feature follows the existing board editor pattern and establishes a reusable file management API for future features.

## Requirements

**Must have:**
- List skill files in `.claude/skills/` directory
- Create new skill files with a template
- Edit existing skill files with markdown editing
- Save changes to skill files
- Flat file organization (no nested folders for skills)
- Generic file API that can be extended to other namespaces

**Future enhancements (out of scope):**
- Rename/move/delete operations
- Nested folder support (wiki browser will need this)
- Syntax validation
- Skill activation/testing

## Architecture

### API Design - Namespace-Based Generic File API

The file API uses namespace-based routing to support multiple file management contexts while maintaining clear boundaries.

**Endpoints:**

```
GET    /api/boards/:boardId/files/:namespace
GET    /api/boards/:boardId/files/:namespace/:filepath*
POST   /api/boards/:boardId/files/:namespace/:filepath*
PATCH  /api/boards/:boardId/files/:namespace/:filepath*
DELETE /api/boards/:boardId/files/:namespace/:filepath*
```

**Namespace registry:**
- `skills` → `.claude/skills/`
- `prompts` → `.claude/prompts/` (future)
- `hooks` → `.claude/hooks/` (future)

**Why namespace-based?**
- RESTful URLs that clearly indicate the file context
- Self-documenting - namespaces make allowed directories explicit
- Easy to extend - adding new namespaces requires only registry update
- Security boundary - unmapped namespaces return 400

**Request/Response formats:**

List files:
```typescript
GET /api/boards/:boardId/files/skills
Response: { files: FileNode[] }

interface FileNode {
  name: string;
  isDirectory: boolean;
  size?: number;
  modified?: string; // ISO timestamp
}
```

Read file:
```typescript
GET /api/boards/:boardId/files/skills/testing-tdd.md
Response: { content: string, path: string }
```

Write/create file:
```typescript
POST /api/boards/:boardId/files/skills/testing-tdd.md
Body: { content: string }
Response: { ok: boolean, path: string }
```

Update file:
```typescript
PATCH /api/boards/:boardId/files/skills/testing-tdd.md
Body: { content: string }
Response: { ok: boolean }
```

Delete file:
```typescript
DELETE /api/boards/:boardId/files/skills/testing-tdd.md
Response: { ok: boolean }
```

### Storage Layer Design

New module: `src/storage/files.ts`

**Core functions:**

```typescript
listFiles(boardPath: string, namespace: string): Promise<FileNode[]>
readFile(boardPath: string, namespace: string, filepath: string): Promise<string>
writeFile(boardPath: string, namespace: string, filepath: string, content: string): Promise<void>
deleteFile(boardPath: string, namespace: string, filepath: string): Promise<void>
```

**Namespace mapping:**
```typescript
const NAMESPACE_DIRS: Record<string, string> = {
  skills: '.claude/skills',
  prompts: '.claude/prompts',
  hooks: '.claude/hooks',
};
```

**Security validation:**
- Reject paths containing `..` (directory traversal prevention)
- Reject absolute paths (must be relative to namespace root)
- Validate namespace exists in registry
- Only allow operations within mapped directories

**File naming constraints:**
- For skills namespace: require `.md` extension
- Sanitize filenames (alphanumeric, hyphens, underscores, dots only)
- No spaces in filenames

**Directory initialization:**
- `.claude/skills/` created lazily on first access
- Not created during board creation (keeps structure minimal)
- Created automatically when listing files or creating first skill

### UI Design

**Integration into BoardEditorRoute:**

Add navigation item below "CLAUDE.md":
- Text: ".claude/skills"
- Route: `?skills=true`
- Component: `<SkillsEditor>`

**Component structure:**

```
SkillsEditor
├── Left panel (200px fixed)
│   ├── Header with "+ New Skill" button
│   └── File list (flat)
│       └── FileListItem (clickable, highlights when selected)
└── Right panel (flex-1)
    ├── Empty state: "Select a skill to edit"
    └── File editor
        ├── Filename header (read-only initially)
        ├── Markdown editor (textarea)
        └── Markdown preview (when not editing)
```

**File editor behavior:**
- Click-to-edit pattern like CLAUDE.md editor
- Blur-to-save (auto-save on blur)
- Toast notification on save success/failure
- Markdown preview when not editing

**New file creation flow:**
1. User clicks "+ New Skill"
2. Prompt for filename (inline input or modal)
3. Validate filename (alphanumeric, hyphens, no spaces)
4. Auto-append `.md` if missing
5. Create file with template via POST
6. Invalidate file list query
7. Select newly created file
8. Open editor with template content

**Skill template:**
```markdown
---
name: skill-name
description: Brief description of what this skill does
---

# Skill Name

Skill content goes here.
```

**State management:**

React Query hooks (following existing patterns):
- `useSkillFiles(boardId)` - List files
- `useSkillFile(boardId, filename)` - Read file content
- `useCreateSkillFile(boardId)` - Create file mutation
- `usePatchSkillFile(boardId, filename)` - Update file mutation

Cache invalidation:
- Creating file invalidates file list
- Updating file invalidates both file list (timestamps) and individual file
- Deleting file (future) invalidates file list

## Data Flow

**List skills:**
```
UI → useSkillFiles hook
  → GET /api/boards/:boardId/files/skills
  → listFiles(boardPath, 'skills')
  → readdir .claude/skills/
  → Return FileNode[]
```

**Read skill:**
```
UI → useSkillFile hook
  → GET /api/boards/:boardId/files/skills/foo.md
  → readFile(boardPath, 'skills', 'foo.md')
  → readFile .claude/skills/foo.md
  → Return content
```

**Create skill:**
```
UI → useCreateSkillFile mutation
  → POST /api/boards/:boardId/files/skills/foo.md
  → writeFile(boardPath, 'skills', 'foo.md', TEMPLATE)
  → mkdir -p .claude/skills/
  → writeFile .claude/skills/foo.md
  → Invalidate file list query
  → UI selects new file
```

**Update skill:**
```
UI → usePatchSkillFile mutation
  → PATCH /api/boards/:boardId/files/skills/foo.md
  → writeFile(boardPath, 'skills', 'foo.md', content)
  → writeFile .claude/skills/foo.md
  → Toast success
```

## Error Handling

**Storage layer errors:**
- `NotFoundError` - File or namespace doesn't exist
- `InvalidInputError` - Invalid filename, path traversal, unsupported namespace, wrong extension
- `ConflictError` - File already exists (future, currently allow overwrites)

**API error responses:**
- 400 Bad Request - Invalid namespace, invalid filepath, path traversal, missing content
- 404 Not Found - File doesn't exist, board doesn't exist
- 500 Internal Server Error - Filesystem errors

**UI error handling:**
- Toast notifications for all errors (`toast.error()`)
- Graceful degradation if directory can't be read (show empty state)
- Validation on filename input (prevent invalid characters before API call)
- Loading states during file operations

**Edge cases:**
- Empty skills directory → Show empty state with "Create your first skill" message
- Large files → No size limit initially
- Concurrent edits → Last write wins (no conflict resolution)
- Invalid markdown in template → User can fix in editor, no content validation

## Implementation Plan

**New files:**
1. `src/storage/files.ts` - Generic file operations
2. `src/server/routes/files.ts` - File API endpoints  
3. `src/web/components/SkillsEditor.tsx` - Skills UI component
4. `tests/storage/files.test.ts` - Storage tests
5. `tests/server/routes/files.test.ts` - API tests

**Modified files:**
1. `src/web/routes/BoardEditorRoute.tsx` - Add navigation and route
2. `src/server/index.ts` - Register file routes
3. `src/shared/types.ts` - Add FileNode type
4. `src/shared/api.ts` - Add file API types
5. `src/web/hooks/queries.ts` - Add file operation hooks

**Testing strategy:**

Storage layer tests:
- Namespace mapping works correctly
- CRUD operations in valid namespace
- Invalid namespace rejection
- Path traversal prevention (`../`, absolute paths)
- Directory creation on first access
- Proper error types

API tests:
- List/read/write/update/delete endpoints work
- Invalid namespace returns 400
- Invalid filepath returns 400
- Missing file returns 404

UI component tests:
- Empty state renders when no files
- File list displays files correctly
- File selection loads content
- New file creation flow works
- Edit and save updates content

## Future Extensions

The namespace-based file API is designed to support:

1. **Wiki browser** - Add `wiki` namespace, build tree view component for nested folders
2. **Prompts library** - Add `prompts` namespace, similar flat structure to skills
3. **Custom hooks** - Add `hooks` namespace for user-defined hooks
4. **Template library** - Add `templates` namespace for reusable content

The skills editor keeps flat organization, but the API supports nesting. Future components can implement tree views using the same backend.

## Design Decisions

**Why namespace-based API instead of path-based?**
- Clearer REST semantics - namespace is part of the resource identifier
- Self-documenting URLs
- Easier to extend without API versioning
- Security boundary is explicit

**Why flat skills organization?**
- Matches Claude Code standard practice (`~/.claude/skills/`)
- Simpler discovery and browsing
- Users can organize with naming conventions
- Sufficient for typical 5-20 skill collections

**Why lazy directory creation?**
- Keeps board structure minimal until features are used
- Matches existing patterns (CLAUDE.md created during board setup, lanes/ created during board setup)
- No migration needed for existing boards

**Why template instead of blank file?**
- Skills have expected frontmatter format for Claude Code
- Reduces errors from missing required fields
- Improves user experience (don't need to remember format)
- Makes skills immediately usable

**Why no delete operation initially?**
- Keeps scope focused on creation and editing
- Can be added later with proper confirmation UI
- Users can delete files outside Meeseeks if needed

**Why blur-to-save instead of explicit save button?**
- Matches CLAUDE.md editor pattern
- Reduces friction in editing workflow
- Provides immediate feedback via toast
- Users expect auto-save in modern web apps

## Rollout

This is a purely additive feature:
- No breaking changes to existing functionality
- No data migration required
- Existing boards work unchanged
- `.claude/skills/` created on first access
- No version changes or rollback concerns
