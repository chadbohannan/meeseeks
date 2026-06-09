import type { LaneState } from '../shared/types.js';

/**
 * Onboarding defaults. These templates give a freshly created board enough
 * scaffolding to be productive — a structured CONTEXT.md, a ready-to-use
 * Development lane, and a state-aware PROCESS.md generator for lanes the user
 * adds later. They are deliberately generic: the org-specific machinery seen on
 * mature boards (JIRA proxy headers, .claude/bin discipline, code-rag globs)
 * is left for users to add, not baked in.
 */

/** The Development lane seeded into every new board. */
export const STARTER_LANE: { name: string; states: LaneState[] } = {
  name: 'Development',
  states: [
    { dir: 'todo', name: 'Todo' },
    { dir: 'in-progress', name: 'In Progress' },
    { dir: 'review', name: 'Review' },
    { dir: 'done', name: 'Done' },
  ],
};

/** Board-level CONTEXT.md written when a board is created. */
export function boardContextTemplate(name: string): string {
  return `# ${name}

One-line description of what this board manages. If it tracks work on a
codebase, link the repository path here so agents can find it.

## How this board works

Your work lives as files on disk. Each lane under \`lanes/\` is a workflow;
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
`;
}

/** Filled-in PROCESS.md for the seeded Development lane. */
export const STARTER_LANE_PROCESS = `# Development Process

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
`;

/**
 * PROCESS.md for a user-created lane: a "first action" preamble plus one
 * fill-in section per state, in the order the user defined them.
 */
export function laneProcessTemplate(laneName: string, states: LaneState[]): string {
  const sections = states
    .map(s => `## ${s.name}\nDescribe when a ticket enters this state and what happens here.\n`)
    .join('\n');
  return `# ${laneName} Process

**First action:** move the ticket into the state that matches the work you're
about to do.

${sections}`;
}
