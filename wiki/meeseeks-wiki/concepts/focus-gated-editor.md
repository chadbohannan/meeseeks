# Focus-Gated Editor

Meeseeks edits the same Markdown files that supervised agents and the filesystem watcher are simultaneously reading and rewriting. Naively re-rendering an open [MarkdownEditor](../components/web.md) from server snapshots — the default React Query + WebSocket pattern used everywhere else in the [Web UI](../components/web.md) — corrupts in-progress typing: the editor refetches mid-keystroke, the user's recent characters get overwritten, and a debounced save then persists the truncated text. This page describes the focus-gated pattern the ticket body, workflow PROCESS.md, and project context all use to coexist with live updates.

## Why React-focus events weren't enough

The editor wraps Milkdown's Crepe, which renders into a contenteditable subtree managed outside React's synthetic event system. Standard `onFocus`/`onBlur` props on the wrapper don't fire reliably when focus moves into the contenteditable, and they fire spuriously when focus moves between the editor's own toolbar buttons and the text surface. `MarkdownEditor` instead attaches native `focusin`/`focusout` listeners on its container ref and treats a `focusout` whose `relatedTarget` stays inside the container as a non-event. The component then exposes the resulting transitions through `onFocus`/`onBlur` callback props that route consumers can hook into.

## The gating rule

`FocusGatedMarkdownEditor` (workflow editor and project context) and the body editor in `TicketRoute` both follow the same invariant: while the editor is focused or has a dirty buffer, local state is authoritative. Server snapshots that arrive during this window are not adopted. When focus is lost and the buffer is clean (last persisted body matches the editor's content), the next server snapshot is allowed through normally — which is what makes external edits visible without a remount. The pattern is therefore strictly stronger than the earlier `bodyInitializedRef` approach, which froze the editor permanently after first mount.

## Distinguishing echoes from genuine external edits

Every save is debounced (3 s) and PATCHes the file; the [filesystem watcher](../components/server.md) then fires a WS event that triggers a refetch of the same record. Most refetches that land during editing are echoes of the user's own write, not external edits, so the route can't simply alert on every divergence from `lastPersistedBody`. Two suppressions handle the real-world races:

- A `savesInFlight` counter is incremented before each PATCH and decremented after; any snapshot received while the counter is non-zero is presumed to be an in-flight echo and never raises a conflict toast.
- In `TicketRoute`, `lastPersistedUpdated` records the `updated` timestamp from the server response of the most recent successful save. Snapshots with an older `updated` are stale watcher echoes that resolved after a newer save and are discarded for conflict-detection purposes.

When a snapshot survives both filters and still diverges from `lastPersistedBody`, a one-shot toast warns the user that the file changed on disk and that their next save will overwrite it. The toast latch resets only after a clean adoption, so a single external edit produces a single warning rather than one per keystroke.

## Why trailing-newline equality matters

`gray-matter` normalizes the body on serialization by appending a trailing newline if one isn't present. A round-trip through `updateTicket` therefore always returns a body one newline longer than the editor sent, which would register as an external edit on the next refetch. Both routes compare bodies with a `bodiesEquivalent` helper that does a `trimEnd()` comparison. The [storage layer](../components/storage.md) closes the gap from the other side: `updateTicket` re-parses its own serialized output and returns the normalized body in the response, so `lastPersistedBody` matches what subsequent reads will produce.

## Pending-buffer flush

The 3 s debounce conflicts with two natural exit paths: blurring the editor (the user expects their work to land) and navigating away mid-debounce (unmount otherwise drops the pending write). `pendingBodyRef` holds the exact text the timer would have written; both `onBlur` and the unmount cleanup call `flushPendingSave`, which clears the timer and dispatches the held buffer immediately. Unmount uses a `flushRef` indirection so the cleanup function always sees the latest `flushPendingSave` closure rather than the one captured on first render.

## Read-only lock while the agent is running

The gating rule above still has a gap: it only protects a save the user *initiated*. If the user is idle but has the ticket open with the cursor sitting in the editor (`bodyFocusedRef.current` true with nothing typed), the load effect refuses every server snapshot indefinitely — including the agent's own output landing in the file — and the next stray keystroke's debounced save overwrites all of it with the stale copy that was loaded at focus time. This was especially costly because the ticket body is exactly what the user opens the ticket to watch the agent write.

`TicketRoute` closes this gap by deriving `locked = runtime?.status === 'running'` from the [`RuntimeStatus`](../components/web.md) pushed over the runtime WS channel, and passing it down as a genuine `readOnly` prop into `MarkdownEditor`, which calls Crepe's `setReadonly()` — this is enforced by the editor's ProseMirror instance, not just a save-time check, so no keystroke can produce a dirty buffer in the first place. The title input and color picker are disabled the same way, since the agent has no scoped "patch ticket" tool and instead rewrites the ticket file's frontmatter directly through its normal filesystem tools (see the [storage layer](../components/storage.md)'s note that tickets are "co-edited by Meeseeks, the user's text editor, and supervised agents that may rewrite frontmatter aggressively").

Locking is chosen specifically as `'running'` rather than the broader `activeRuntime` set (which also includes `'starting'`, `'idle'`, `'awaiting-user'`) because those other states are exactly when the agent is *not* actively writing — pausing there to let the user read or edit is the point of the state machine. An effect keyed on `locked` fires the instant the transition to `'running'` happens: it force-clears `bodyFocusedRef` and calls `saveIfDirty()` so any edit in flight is flushed rather than silently dropped, before the editor goes read-only out from under the user. Because a locked editor is therefore always unfocused and never dirty, the existing focus-gating effect described above takes its "adopt the server snapshot" branch on every refetch while the agent runs — the read-only lock doesn't need its own separate sync path; it just satisfies the precondition the gating rule already had.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-05-19 | `src/web/components/MarkdownEditor.tsx`, `src/web/routes/TicketRoute.tsx`, `src/web/routes/BoardEditorRoute.tsx`, `src/storage/ticket.ts` |
| 2026-08-24 | `src/web/components/MarkdownEditor.tsx`, `src/web/routes/TicketRoute.tsx`, `src/shared/runtime.ts` |
