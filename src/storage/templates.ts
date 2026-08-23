import type { PermissionsConfig, WorkflowState } from '../shared/types.js';

/**
 * Onboarding defaults. These templates give a freshly created workspace enough
 * scaffolding to be productive — a ready-to-use Development workflow with a
 * filled-in process document, a state-aware PROCESS.md generator for workflows
 * the user adds later, and a conservative starting permission set for a newly
 * registered project. They are deliberately generic: the org-specific machinery
 * seen on mature workspaces (JIRA proxy headers, .claude/bin discipline,
 * code-rag globs) is left for users to add, not baked in.
 */

/** The Development workflow seeded into every new workspace. */
export const STARTER_WORKFLOW: { name: string; states: WorkflowState[] } = {
  name: 'Development',
  states: [
    { dir: 'todo', name: 'Todo' },
    { dir: 'in-progress', name: 'In Progress' },
    { dir: 'review', name: 'Review' },
    { dir: 'done', name: 'Done' },
  ],
};

/** Filled-in PROCESS.md for the seeded Development workflow. */
export const STARTER_WORKFLOW_PROCESS = `# Development Process

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
 * PROCESS.md for a user-created workflow: a "first action" preamble plus one
 * fill-in section per state, in the order the user defined them.
 */
export function workflowProcessTemplate(workflowName: string, states: WorkflowState[]): string {
  const sections = states
    .map(s => `## ${s.name}\nDescribe when a ticket enters this state and what happens here.\n`)
    .join('\n');
  return `# ${workflowName} Process

**First action:** move the ticket into the state that matches the work you're
about to do.

${sections}`;
}

/** Placeholder in `STARTER_PERMISSIONS`, replaced with the project's root. */
export const ROOT_PLACEHOLDER = '{root}';

/**
 * The starting permission set for a newly registered project.
 *
 * This is the one default the audited workspace legitimately informs, and it is
 * curated rather than scraped: that workspace's grants were absolute to one
 * machine and specific to one ecosystem, so only the part true of every
 * codebase survives — read access to the root the user just pointed at.
 * Build and test commands are ecosystem-specific and belong to detection,
 * which can propose them from what the repository actually declares.
 *
 * Write and Edit are deliberately absent. Granting read access to a repository
 * and granting write access to it are different decisions, and only the first
 * is implied by registering it.
 */
export const STARTER_PERMISSIONS: PermissionsConfig = {
  allowedPaths: [],
  allowedTools: [`Read(${ROOT_PLACEHOLDER}/**)`],
  deniedTools: [],
};

/** Resolve `STARTER_PERMISSIONS` against a concrete project root. */
export function starterPermissions(root: string): PermissionsConfig {
  const sub = (v: string): string => v.split(ROOT_PLACEHOLDER).join(root);
  return {
    allowedPaths: STARTER_PERMISSIONS.allowedPaths.map(sub),
    allowedTools: STARTER_PERMISSIONS.allowedTools.map(sub),
    deniedTools: STARTER_PERMISSIONS.deniedTools.map(sub),
  };
}
