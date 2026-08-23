import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import {
  createWorkflow, listWorkflows, readWorkflowDetail, renameWorkflow, updateWorkflowStates,
  deleteWorkflowFolder, resolveWorkflowRuntime, readClonableWorkflowConfig,
} from '../../src/storage/workflow.js';
import {
  readWorkspace, writeWorkspace, addWorkflowToWorkspace,
} from '../../src/storage/workspace.js';
import { ConflictError, NotFoundError, InvalidWorkflowError } from '../../src/storage/errors.js';
import { makeBareProject, writeYaml } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

const STATES = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'doing', name: 'Doing' },
  { dir: 'done', name: 'Done' },
];

async function setupWorkspace() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  // Workflows now hang off the workspace root, so the workspace *is* what was
  // previously the board path — every `<board>/workflows/x` becomes
  // `<workspace>/workflows/x` with no other change.
  return { tp, wsRoot: tp.root };
}

describe('createWorkflow', () => {
  it('creates folder, workflow.yaml, state subfolders', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const workflowPath = path.join(wsRoot, 'workflows/work');
    expect(await exists(path.join(workflowPath, 'workflow.yaml'))).toBe(true);
    expect(await exists(path.join(workflowPath, 'PROCESS.md'))).toBe(true);
    expect(await exists(path.join(workflowPath, 'permissions.yaml'))).toBe(true);
    for (const s of STATES) {
      expect(await exists(path.join(workflowPath, s.dir))).toBe(true);
    }
    const yaml = await readFile(path.join(workflowPath, 'workflow.yaml'), 'utf8');
    expect(yaml).toContain('todo');
  });

  it('generates a PROCESS.md with one section per state', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const process = await readFile(path.join(wsRoot, 'workflows/work/PROCESS.md'), 'utf8');
    expect(process).toContain('work Process');
    for (const s of STATES) {
      expect(process).toContain(`## ${s.name}`);
    }
  });

  it('rejects duplicate workflow name', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await expect(createWorkflow(wsRoot, 'work', STATES)).rejects.toThrow(ConflictError);
  });
});

describe('listWorkflows / readWorkflowDetail', () => {
  it('lists workflows with empty ticket counts', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const workflows = await listWorkflows(wsRoot);
    const work = workflows.find(l => l.workflowName === 'work');
    expect(work).toBeDefined();
    expect(work!.ticketCounts).toEqual({ todo: 0, doing: 0, done: 0 });
  });

  it('throws InvalidWorkflowError when workflow.yaml missing', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(wsRoot, 'workflows/work/workflow.yaml'));
    await expect(readWorkflowDetail(wsRoot, 'work')).rejects.toThrow(InvalidWorkflowError);
  });

  it('auto-creates state folders missing on disk but listed in workflow.yaml', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(wsRoot, 'workflows/work/doing'), { recursive: true });
    await readWorkflowDetail(wsRoot, 'work');  // auto-creates
    expect(await exists(path.join(wsRoot, 'workflows/work/doing'))).toBe(true);
  });
});

describe('updateWorkflowStates', () => {
  it('adds a new state folder', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await updateWorkflowStates(wsRoot, 'work', [...STATES, { dir: 'review', name: 'Review' }]);
    expect(await exists(path.join(wsRoot, 'workflows/work/review'))).toBe(true);
  });

  it('rejects removal of a state folder containing tickets unless force=true', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await writeYaml(path.join(wsRoot, 'workflows/work/doing/2026-04-26T1430-x.md'), '---\ntitle: x\n---\n');
    await expect(
      updateWorkflowStates(wsRoot, 'work', STATES.filter(s => s.dir !== 'doing')),
    ).rejects.toThrow(ConflictError);
  });
});

describe('renameWorkflow', () => {
  it('renames folder', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await renameWorkflow(wsRoot, 'work', 'engineering');
    expect(await exists(path.join(wsRoot, 'workflows/engineering'))).toBe(true);
    expect(await exists(path.join(wsRoot, 'workflows/work'))).toBe(false);
  });
});

describe('deleteWorkflowFolder', () => {
  it('removes workflow', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await deleteWorkflowFolder(wsRoot, 'work');
    expect(await exists(path.join(wsRoot, 'workflows/work'))).toBe(false);
  });

  it('throws NotFoundError on missing workflow', async () => {
    const { wsRoot } = await setupWorkspace();
    await expect(deleteWorkflowFolder(wsRoot, 'nope')).rejects.toThrow(NotFoundError);
  });
});

describe('workflow registry', () => {
  it('registers a created workflow in workspace.yaml', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const meta = await readWorkspace(wsRoot);
    expect(meta.config.workflows).toEqual(['workflows/work']);
  });

  // Registration and presence on disk are separate facts. A registered entry
  // whose directory is gone is listed as unavailable rather than dropped,
  // otherwise a mistyped entry would look like no workflow at all.
  it('lists a registered-but-missing workflow as unavailable', async () => {
    const { wsRoot } = await setupWorkspace();
    await addWorkflowToWorkspace(wsRoot, 'workflows/ghost');
    const list = await listWorkflows(wsRoot);
    expect(list).toHaveLength(1);
    expect(list[0]!.workflowName).toBe('ghost');
    expect(list[0]!.available).toBe(false);
  });

  it('ignores an unregistered directory under workflows/', async () => {
    const { wsRoot } = await setupWorkspace();
    await writeYaml(
      path.join(wsRoot, 'workflows/stray/workflow.yaml'),
      'name: Stray\nstates:\n  - dir: todo\n    name: Todo\n',
    );
    expect(await listWorkflows(wsRoot)).toEqual([]);
  });

  it('rewrites the registry entry when a rename changes the slug', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await renameWorkflow(wsRoot, 'work', 'Incident Response');
    const meta = await readWorkspace(wsRoot);
    expect(meta.config.workflows).toEqual(['workflows/incident-response']);
    expect(await exists(path.join(wsRoot, 'workflows/incident-response'))).toBe(true);
    expect(await exists(path.join(wsRoot, 'workflows/work'))).toBe(false);
  });

  it('deregisters on delete', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await deleteWorkflowFolder(wsRoot, 'work');
    expect((await readWorkspace(wsRoot)).config.workflows).toEqual([]);
    expect(await listWorkflows(wsRoot)).toEqual([]);
  });

  // Deleting a stub must clear the registry even though there is no directory
  // to remove, or the entry becomes impossible to get rid of from the UI.
  it('deregisters a registered-but-missing workflow', async () => {
    const { wsRoot } = await setupWorkspace();
    await addWorkflowToWorkspace(wsRoot, 'workflows/ghost');
    await deleteWorkflowFolder(wsRoot, 'ghost');
    expect((await readWorkspace(wsRoot)).config.workflows).toEqual([]);
  });
});

describe('resolveWorkflowRuntime', () => {
  const RUNTIME = {
    harness: 'claude-code', provider: 'anthropic', model: 'opus', args: [], env: {},
  };

  it('returns null when neither workflow nor workspace defines one', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const r = await resolveWorkflowRuntime(wsRoot, 'work');
    expect(r.runtime).toBeNull();
    expect(r.inherited).toBe(false);
  });

  it('falls back to the workspace default', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const meta = await readWorkspace(wsRoot);
    await writeWorkspace(wsRoot, { ...meta.config, runtime: RUNTIME });
    const r = await resolveWorkflowRuntime(wsRoot, 'work');
    expect(r.runtime).toEqual(RUNTIME);
    expect(r.inherited).toBe(true);
  });

  it("prefers the workflow's own block", async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES, {
      runtime: { ...RUNTIME, model: 'haiku' },
    });
    const meta = await readWorkspace(wsRoot);
    await writeWorkspace(wsRoot, { ...meta.config, runtime: RUNTIME });
    const r = await resolveWorkflowRuntime(wsRoot, 'work');
    expect(r.runtime!.model).toBe('haiku');
    expect(r.inherited).toBe(false);
  });

  // Whole-block, not per-field: a workflow that declares a runtime gets empty
  // args/env rather than the workspace's. Note this property is really enforced
  // by parseRuntime, which rejects blocks missing harness/provider/model and
  // defaults args/env — so a partially-declared block never reaches the
  // resolver at all, and there is nothing for a field-wise merge to merge.
  it('does not inherit args or env into a workflow that declares a runtime', async () => {
    const { wsRoot } = await setupWorkspace();
    await writeYaml(
      path.join(wsRoot, 'workflows/work/workflow.yaml'),
      'name: work\nstates:\n  - dir: todo\n    name: Todo\n'
      + 'runtime:\n  harness: claude-code\n  provider: anthropic\n  model: haiku\n',
    );
    await addWorkflowToWorkspace(wsRoot, 'workflows/work');
    const meta = await readWorkspace(wsRoot);
    await writeWorkspace(wsRoot, {
      ...meta.config,
      runtime: { ...RUNTIME, env: { FROM_WORKSPACE: '1' }, args: ['--verbose'] },
    });
    const r = await resolveWorkflowRuntime(wsRoot, 'work');
    expect(r.runtime!.model).toBe('haiku');
    expect(r.runtime!.env).toEqual({});
    expect(r.runtime!.args).toEqual([]);
  });

  // A block missing a required field is rejected outright rather than
  // half-populated, which would spawn an agent on a silently wrong model.
  it('ignores a runtime block missing required fields', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    await writeYaml(
      path.join(wsRoot, 'workflows/work/workflow.yaml'),
      'name: work\nstates:\n  - dir: todo\n    name: Todo\nruntime:\n  model: opus\n',
    );
    expect((await resolveWorkflowRuntime(wsRoot, 'work')).runtime).toBeNull();
  });

  it('surfaces the resolved runtime and its origin on the detail', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'work', STATES);
    const meta = await readWorkspace(wsRoot);
    await writeWorkspace(wsRoot, { ...meta.config, runtime: RUNTIME });
    const detail = await readWorkflowDetail(wsRoot, 'work');
    expect(detail.runtime).toEqual(RUNTIME);
    expect(detail.runtimeInherited).toBe(true);
  });
});

describe('readClonableWorkflowConfig', () => {
  const RUNTIME = {
    harness: 'claude-code', provider: 'anthropic', model: 'opus', args: [], env: {},
  };
  const PERMS = { allowedPaths: ['./src'], allowedTools: ['Bash(npm test *)'], deniedTools: [] };

  it('returns the workflow\'s own runtime block and permissions', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'source', STATES, { runtime: RUNTIME, permissions: PERMS });

    const cfg = await readClonableWorkflowConfig(wsRoot, 'source');
    expect(cfg.runtime).toEqual(RUNTIME);
    expect(cfg.permissions).toEqual(PERMS);
  });

  // Copying an inherited block would turn an inheritance into a declaration
  // that no longer tracks the workspace default.
  it('does not report an inherited runtime as the workflow\'s own', async () => {
    const { wsRoot } = await setupWorkspace();
    const meta = await readWorkspace(wsRoot);
    await writeWorkspace(wsRoot, { ...meta.config, runtime: RUNTIME });
    await createWorkflow(wsRoot, 'inheritor', STATES);

    expect((await resolveWorkflowRuntime(wsRoot, 'inheritor')).inherited).toBe(true);
    expect((await readClonableWorkflowConfig(wsRoot, 'inheritor')).runtime).toBeUndefined();
  });

  // Every workflow starts with three empty arrays; copying that says nothing
  // and would make the clone look configured when it is not.
  it('omits an all-empty permissions block', async () => {
    const { wsRoot } = await setupWorkspace();
    await createWorkflow(wsRoot, 'bare', STATES);
    expect(await readClonableWorkflowConfig(wsRoot, 'bare')).toEqual({});
  });

  it('throws for a workflow that does not exist', async () => {
    const { wsRoot } = await setupWorkspace();
    await expect(readClonableWorkflowConfig(wsRoot, 'nope')).rejects.toThrow(NotFoundError);
  });
});

describe('createWorkflow with copied configuration', () => {
  it('writes the copied permissions to the new workflow', async () => {
    const { wsRoot } = await setupWorkspace();
    const perms = { allowedPaths: [], allowedTools: ['Bash(make test *)'], deniedTools: ['Bash(rm *)'] };
    await createWorkflow(wsRoot, 'clone', STATES, { permissions: perms });

    const written = await readFile(path.join(wsRoot, 'workflows/clone/permissions.yaml'), 'utf8');
    expect(written).toContain('Bash(make test *)');
    expect(written).toContain('Bash(rm *)');
  });
});
