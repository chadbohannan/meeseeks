# Markdown Ticket Body Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render ticket bodies as Markdown everywhere, with click-to-edit in the ticket editor.

**Architecture:** A shared `<Markdown>` component wraps `react-markdown` + `remark-gfm` with dark-themed prose styling. TicketCard uses it for display. TicketRoute toggles between the Markdown view and a textarea, restructuring the layout so the body fills available space and buttons pin to the bottom.

**Tech Stack:** react-markdown, remark-gfm, @tailwindcss/typography, Tailwind CSS prose classes

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add 3 new dependencies |
| `tailwind.config.js` | Modify | Register typography plugin |
| `src/web/components/Markdown.tsx` | Create | Shared Markdown rendering component |
| `src/web/components/TicketCard.tsx` | Modify | Use `<Markdown>` for body text |
| `src/web/routes/TicketRoute.tsx` | Modify | Editing toggle, layout restructure, `<Markdown>` integration |

---

### Task 1: Install dependencies and configure Tailwind

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.js`

- [ ] **Step 1: Install npm packages**

Run:
```bash
npm install react-markdown remark-gfm @tailwindcss/typography
```

Expected: packages added to `dependencies` in `package.json`, `node_modules` updated.

- [ ] **Step 2: Add typography plugin to Tailwind config**

Modify `tailwind.config.js` to:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/web/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/typography')],
};
```

- [ ] **Step 3: Verify the dev server starts**

Run:
```bash
npm run dev:web
```

Expected: Vite dev server starts without errors. Kill it after confirming.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tailwind.config.js
git commit -m "Add react-markdown, remark-gfm, and @tailwindcss/typography"
```

---

### Task 2: Create shared Markdown component

**Files:**
- Create: `src/web/components/Markdown.tsx`

- [ ] **Step 1: Create the Markdown component**

Create `src/web/components/Markdown.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  children: string;
  className?: string;
}

export function Markdown({ children, className = '' }: Props) {
  return (
    <ReactMarkdown
      className={`prose prose-invert prose-sm prose-slate max-w-none ${className}`}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </ReactMarkdown>
  );
}
```

Key styling choices:
- `prose-invert` — light text on dark background (matches the slate-950 theme)
- `prose-sm` — smaller text to fit the compact UI
- `prose-slate` — slate gray accent colors for links, code, etc.
- `max-w-none` — don't constrain width (the parent controls layout)

- [ ] **Step 2: Commit**

```bash
git add src/web/components/Markdown.tsx
git commit -m "Add shared Markdown rendering component"
```

---

### Task 3: Use Markdown in TicketCard

**Files:**
- Modify: `src/web/components/TicketCard.tsx`

- [ ] **Step 1: Replace plain-text body with Markdown**

In `src/web/components/TicketCard.tsx`, add the import at the top:

```tsx
import { Markdown } from './Markdown.js';
```

Replace line 44:
```tsx
{ticket.body && <div className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">{ticket.body}</div>}
```

With:
```tsx
{ticket.body && <div className="text-xs text-slate-300 mt-2"><Markdown>{ticket.body}</Markdown></div>}
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev`, navigate to a board view, and confirm ticket cards render Markdown (bold, links, lists, code blocks) instead of plain text. Verify the card layout is not broken — the Markdown output should fit within the card's natural size.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/TicketCard.tsx
git commit -m "Render ticket card bodies as Markdown"
```

---

### Task 4: Restructure TicketRoute layout and add editing toggle

**Files:**
- Modify: `src/web/routes/TicketRoute.tsx`

- [ ] **Step 1: Add Markdown import and editing state**

In `src/web/routes/TicketRoute.tsx`, add the import at the top alongside existing imports:

```tsx
import { Markdown } from '../components/Markdown.js';
```

Inside the `TicketRoute` function, after the existing `useState` calls (after line 26), add:

```tsx
const [editing, setEditing] = useState(false);
```

- [ ] **Step 2: Replace the ticketEditor JSX**

Replace the entire `ticketEditor` const (lines 45-127) with this restructured version that uses flex column layout and the editing toggle:

```tsx
  const ticketEditor = (
    <div className="p-6 max-w-3xl h-full flex flex-col">
      <nav className="text-sm text-slate-400 mb-3 shrink-0">
        <button className="hover:text-white" onClick={() => navigate(stateUrl)}>← {stateName}</button>
      </nav>
      <input
        className="w-full bg-slate-800 rounded px-3 py-2 text-lg font-medium mb-3 shrink-0"
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
      />
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <label className="text-sm text-slate-400">State</label>
        <select
          className="bg-slate-800 rounded px-2 py-1 text-sm"
          value={state}
          onChange={(e) => { setState(e.target.value); setDirty(true); }}
        >
          {states.map((s) => <option key={s.dir} value={s.dir}>{s.name}</option>)}
        </select>
        <span className="text-xs text-slate-500 font-mono ml-auto">{filename}</span>
      </div>
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
              >Complete</button>
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

      {editing ? (
        <textarea
          className="flex-1 min-h-0 w-full bg-slate-800 rounded px-3 py-2 font-mono text-sm overflow-y-auto resize-none"
          value={body}
          onChange={(e) => { setBody(e.target.value); setDirty(true); }}
        />
      ) : (
        <div
          className="flex-1 min-h-0 w-full bg-slate-800 rounded px-3 py-2 overflow-y-auto cursor-pointer hover:ring-1 hover:ring-slate-600"
          onClick={() => setEditing(true)}
        >
          <Markdown>{body}</Markdown>
        </div>
      )}

      <div className="flex justify-between items-center mt-4 shrink-0">
        <button
          className="px-3 py-1 rounded bg-red-700 text-sm"
          onClick={async () => {
            if (!confirm('Delete this ticket?')) return;
            try { await del.mutateAsync(); toast.success('Deleted'); navigate(-1); }
            catch (err) { toast.error((err as Error).message); }
          }}
        >Delete</button>
        {editing && (
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-slate-700 text-sm"
              onClick={() => { setDirty(false); setEditing(false); }}
              disabled={!dirty}
            >Discard</button>
            <button
              className="px-3 py-1 rounded bg-blue-600 text-sm"
              disabled={!dirty || patch.isPending}
              onClick={async () => {
                try {
                  await patch.mutateAsync({ title, body, state });
                  setDirty(false);
                  setEditing(false);
                  toast.success('Saved');
                } catch (err) { toast.error((err as Error).message); }
              }}
            >Save</button>
          </div>
        )}
      </div>
    </div>
  );
```

Key changes from the original:
- Outer div: `h-full overflow-y-auto` → `h-full flex flex-col` (flex column layout)
- All header sections: added `shrink-0` so they don't compress
- Textarea: `h-96` → `flex-1 min-h-0 resize-none overflow-y-auto` (fills remaining space)
- Markdown view: same `flex-1 min-h-0 overflow-y-auto` plus `cursor-pointer hover:ring-1 hover:ring-slate-600`
- Both share: `bg-slate-800 rounded px-3 py-2`
- Button footer: added `shrink-0`, Discard/Save wrapped in `{editing && ...}`
- Discard onClick: now also calls `setEditing(false)`
- Save onClick: now also calls `setEditing(false)`

- [ ] **Step 3: Verify in browser**

Run `npm run dev` and test the following:

1. Open a ticket — body should render as Markdown, no Discard/Save buttons visible
2. Click the body — switches to textarea, Discard/Save appear (disabled)
3. Type something — Discard/Save become enabled
4. Click Discard — returns to Markdown view, changes reverted
5. Click body again, make a change, click Save — saves, returns to Markdown view with new content
6. Resize the browser — body area should expand/contract, buttons stay at bottom
7. Add a long body with many lines — verify it scrolls within the body area, buttons don't move
8. Delete button is always visible regardless of editing state

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/TicketRoute.tsx
git commit -m "Add Markdown rendering with click-to-edit toggle in ticket editor"
```
