import { createWorkflow } from './workflow.js';
import { listWorkflowEntries } from './workspace.js';
import { STARTER_WORKFLOW, STARTER_WORKFLOW_PROCESS } from './templates.js';

/**
 * Give a workspace that has just come into existence a usable starting point:
 * one Development workflow with a filled-in PROCESS.md.
 *
 * It goes through `createWorkflow` — the same path the UI uses — so there is a
 * single code path producing workflow structure on disk, and the seeded
 * workflow is an ordinary one with no marking that it was seeded.
 *
 * Idempotent by construction: it does nothing to a workspace that already has
 * a registered workflow, so a user who deletes the starter does not get it back.
 * Returns the created workflow's id, or null when it seeded nothing.
 */
export async function ensureWorkspaceSeeded(workspaceRoot: string): Promise<string | null> {
  const existing = await listWorkflowEntries(workspaceRoot);
  if (existing.length > 0) return null;
  return createWorkflow(workspaceRoot, STARTER_WORKFLOW.name, STARTER_WORKFLOW.states, {
    processDoc: STARTER_WORKFLOW_PROCESS,
  });
}
