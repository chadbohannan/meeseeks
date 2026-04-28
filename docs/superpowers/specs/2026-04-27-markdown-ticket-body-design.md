# Markdown Ticket Body Rendering

## Overview

Ticket bodies are stored as Markdown but currently rendered as plain text. This spec adds Markdown rendering to both the ticket editor (TicketRoute) and the ticket card (TicketCard), with a click-to-edit interaction in the editor.

## Dependencies

- `react-markdown` — renders Markdown as React elements (no `dangerouslySetInnerHTML`)
- `remark-gfm` — GitHub Flavored Markdown support (tables, task lists, strikethrough)
- `@tailwindcss/typography` — Tailwind `prose` classes for styled Markdown output

## Components

### `Markdown` (`src/web/components/Markdown.tsx`)

A shared component wrapping `react-markdown` with `remark-gfm` and dark-themed `prose` styling. Used by both TicketCard and TicketRoute for consistent rendering. Accepts `children` (the Markdown string) and an optional `className` prop for layout overrides.

### `TicketCard` changes

Replace the plain-text body div (`whitespace-pre-wrap`) with the `<Markdown>` component. No other layout changes — the card's existing size constraints naturally limit visible content.

### `TicketRoute` changes

#### State

Add an `editing` boolean, defaulting to `false`. The editor opens in rendered Markdown view.

#### Rendered view (`editing === false`)

The body area displays `<Markdown>` inside a clickable container. Clicking anywhere on it sets `editing = true`. The container has a subtle hover indicator (e.g., `cursor-pointer hover:ring-1 hover:ring-slate-600`) so the user knows it's interactive. Discard and Save buttons are hidden.

#### Edit view (`editing === true`)

The body area displays the existing `<textarea>`. Discard and Save buttons appear. Discard resets `body` from the server data, sets `dirty = false` and `editing = false`. Save persists changes, sets `dirty = false` and `editing = false`.

#### Layout restructure

The current `ticketEditor` div uses `h-full overflow-y-auto` with a fixed-height textarea (`h-96`). This changes to a flex column layout where:

- The header elements (nav, title, state selector, runtime controls) are fixed-size (`shrink-0`).
- The body area (Markdown or textarea) uses `flex-1 min-h-0 overflow-y-auto` to fill remaining vertical space.
- The button footer is fixed-size (`shrink-0`), always at the bottom.

Both the Markdown container and the textarea share the same visual styling: `bg-slate-800 rounded px-3 py-2` and `overflow-y-auto`, so toggling between them produces no layout shift.

#### Button visibility

- Delete: always visible.
- Discard: visible when `editing === true`, disabled when `!dirty`.
- Save: visible when `editing === true`, disabled when `!dirty || isPending`.

## Tailwind config

Add `@tailwindcss/typography` to the plugins array in `tailwind.config.js`.

## Files changed

| File | Change |
|------|--------|
| `package.json` | Add `react-markdown`, `remark-gfm`, `@tailwindcss/typography` |
| `tailwind.config.js` | Add typography plugin |
| `src/web/components/Markdown.tsx` | New shared component |
| `src/web/components/TicketCard.tsx` | Use `<Markdown>` for body |
| `src/web/routes/TicketRoute.tsx` | Add editing toggle, layout restructure, use `<Markdown>` |
