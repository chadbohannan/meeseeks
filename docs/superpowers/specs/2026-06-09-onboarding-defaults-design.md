# Onboarding Defaults — Design

**Date:** 2026-06-09
**Status:** Approved (design), pending implementation plan

## Problem

A brand-new board gives a new user almost nothing to work from. `createBoard`
in `src/storage/board.ts` writes a one-line placeholder CONTEXT.md
(`# {name}\n\nBoard-level instructions for agents go here.`) and an **empty**
`lanes/` folder — the board has no lanes at all. When the user manually adds a
lane, `createLane` in `src/storage/lane.ts` writes a stub PROCESS.md
(`# Process for {name}\n\nDescribe stages and transition rules here.`).

The result: a new user lands on an empty board, must invent lanes and their
states from scratch, and gets no guidance on what board/lane context is even
useful — much less what good looks like. The mature boards in this repo
(`workexchange`, `jobs`, `g4`, `compute-planet`, `temporal-io`) encode strong,
repeatable conventions, but none of that wisdom reaches a first-time board.

## Goal

Ship **deterministic static templates** that are *functional and sufficient,
but not all-encompassing*: enough scaffolding for a new user to be immediately
productive and to understand what context is worth writing, without dumping the
org-specific machinery (JIRA proxy frontmatter, `.claude/bin/` script
discipline, code-rag filter conventions) that wouldn't generalize.

Non-goals: no AI-assisted drafting, no repo introspection, no template picker /
archetype chooser. Those were considered and explicitly deferred in favor of
the simplest thing that removes the blank-slate problem.

## Conventions extrapolated from existing boards

- **Board CONTEXT.md skeleton:** title + one-line description linking the target
  repo; an explanation that work lives as files and that moving a ticket file
  between state subfolders is the state-change mechanism; a place for
  board-wide agent context; a Lanes overview.
- **Lane archetypes:** Development (Todo → Grooming → In Progress → Review →
  Done), Incident Response (Triage → In Progress → Monitoring → Done),
  Maintenance (Todo → In Progress → Done).
- **PROCESS.md shape:** opens with "First action: move the ticket to the
  appropriate state," then one section per state describing its entry trigger
  and what happens there.

The templates below are the generic distillation of these patterns.

## Design

### Where the templates live

A new module **`src/storage/templates.ts`** holds the board CONTEXT skeleton,
the starter-lane definition, and the lane PROCESS generator. `board.ts` and
`lane.ts` import from it.

Rationale: the existing one-line placeholders justified inline constants
(`DEFAULT_CONTEXT_MD`, the PROCESS stub). Multi-section markdown documents that
two storage files both consume justify a single reviewable, testable module.
This stays within the "improve the code you're working in" boundary — no
unrelated refactoring.

Considered and rejected: keeping everything inline (A — gets unwieldy as the
docs grow across two files); on-disk template files read at runtime (C — adds
path-resolution and packaging concerns with no user-visible benefit).

### Behavior change 1 — `createBoard` seeds a starter lane

`createBoard` will, in addition to writing the richer CONTEXT.md (template 1
below), seed **one ready-to-use Development lane** with states
**Todo → In Progress → Review → Done** and the filled-in PROCESS.md (template 2
below). *Grooming* is intentionally dropped from the seeded set to keep the
first experience lean; users can add it via the existing lane state editor.

The seeded lane is created through the same `createLane` path (or an equivalent
that produces the identical on-disk structure: `lane.yaml`, per-state
subfolders, `PROCESS.md`, `permissions.yaml`) so there is one code path for
lane structure on disk. The starter lane's PROCESS.md content comes from the
dedicated starter template, not the generic generator.

The user lands on a working board they can immediately drop tickets into, and
can add or delete lanes from there.

### Behavior change 2 — richer board CONTEXT.md

`DEFAULT_CONTEXT_MD` is replaced by template 1.

### Behavior change 3 — generic lane PROCESS.md generator

The PROCESS.md stub in `createLane` is replaced by a generator (template 3)
that produces a "First action" preamble plus one `## {state name}` section per
state the user chose, each with a fill-in prompt. This means a user-created
lane is scaffolded against its actual states instead of a single dead stub line.

## Templates

### Template 1 — Board CONTEXT.md

```markdown
# {name}

One-line description of what this board manages. If it tracks work on a
codebase, link the repository path here so agents can find it.

## How this board works

Your work lives as files on disk. Each lane under `lanes/` is a workflow;
within a lane, each state is a subfolder, and **moving a ticket file between
subfolders is how you change its state**. Agents read this file (CONTEXT.md)
for board-wide guidance and a lane's PROCESS.md for that workflow's rules.

## Context for agents

Anything an agent should know before working any ticket on this board goes
here — the systems involved, where the relevant code lives, conventions to
follow, and commands or tools to prefer. This text is injected into every
agent started on this board, so keep it current.

## Lanes

Describe the lanes on this board and what kind of work belongs in each.
A starter Development lane has been created for you.
```

### Template 2 — Starter Development lane PROCESS.md

States: Todo → In Progress → Review → Done.

```markdown
# Development Process

**First action:** move the ticket into the state that matches the work you're
about to do, before doing anything else.

## Todo
New tickets land here. When work starts, move the ticket to In Progress.

## In Progress
The work is actively underway — the plan is stable and implementation is happening.

## Review
The work is complete and in a feedback cycle: code review, testing, or sign-off.
Before marking a ticket done, confirm the implementation matches what the ticket
actually asked for, not just that it runs.

## Done
The work is complete and accepted.
```

### Template 3 — Generic lane PROCESS.md generator

Given the lane display name and its ordered states, produce:

```markdown
# {laneName} Process

**First action:** move the ticket into the state that matches the work you're
about to do.

## {State 1 name}
Describe when a ticket enters this state and what happens here.

## {State 2 name}
Describe when a ticket enters this state and what happens here.
```

(One `## {state name}` section per state, in order.)

## Testing

- `createBoard` produces: richer CONTEXT.md (template 1 with name
  interpolated), and a `lanes/development/` lane with the four expected state
  subfolders, `lane.yaml`, the starter PROCESS.md (template 2), and
  `permissions.yaml`.
- `createLane` with an arbitrary set of states produces a PROCESS.md containing
  the "First action" preamble and exactly one section per state, in order.
- Existing board/lane tests still pass (assertions on the old one-line
  placeholder text are updated to the new content).

## Open refinements (post-first-draft)

Approved as a first draft to refine from. Candidate refinements, not in scope
for the initial cut unless called out:

- Whether to also seed an Incident Response lane, or offer it as a one-click add.
- Whether the generic generator should detect a known archetype by lane name
  and emit the richer matching template instead of fill-in prompts.
- Light mention of optional `scripts/`, `sources/`, `wiki/` folders in the board
  template (currently omitted to avoid implying structure that isn't created).
```
