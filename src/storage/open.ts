import path from 'node:path';
import { exists } from './io.js';
import { readWorkspace, writeWorkspace } from './workspace.js';
import { ensureWorkspaceSeeded } from './seed.js';
import type { WorkspaceConfig, WorkspaceMeta } from '../shared/types.js';

/**
 * First contact with a workspace: create `workspace.yaml` if the directory does
 * not have one yet, seed it with a starter workflow, and return it open.
 *
 * This is deliberately not folded into `readWorkspace`, which runs on nearly
 * every request. A reader that writes has to decide on every call whether this
 * is the creating call, and the only way it could tell was "the config file is
 * missing" — which is also what a wrong path or an unmounted volume looks like.
 * Splitting the two puts creation where creation is actually intended: the
 * server's startup, and the tests that stand a workspace up.
 *
 * It also removes a module cycle. Seeding goes through `createWorkflow`, which
 * reads the workspace, so `workspace -> seed -> workflow -> workspace` closed a
 * loop that had to be broken with a dynamic import. Nothing under `workspace`
 * imports this module, so the loop no longer exists.
 *
 * Callers are the ones that own a workspace root outright, so this is safe to
 * call on an already-open workspace: an existing config is read as-is, and
 * seeding is idempotent — it does nothing to a workspace that already has a
 * registered workflow.
 */
export async function openWorkspace(workspaceRoot: string): Promise<WorkspaceMeta> {
  if (!(await exists(path.join(workspaceRoot, 'workspace.yaml')))) {
    const config: WorkspaceConfig = {
      name: path.basename(workspaceRoot),
      workflows: [],
      projects: [],
    };
    await writeWorkspace(workspaceRoot, config);

    // A failure here must not make the workspace unopenable — an empty
    // workspace is a working one — so it is logged and swallowed.
    try {
      await ensureWorkspaceSeeded(workspaceRoot);
    } catch (err) {
      console.warn(`failed to seed workspace at ${workspaceRoot}:`, err);
    }
  }
  return readWorkspace(workspaceRoot);
}
