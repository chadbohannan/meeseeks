import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access, readdir } from 'node:fs/promises';
import { ensureWorkspaceSeeded } from '../../src/storage/seed.js';
import { readWorkspace } from '../../src/storage/workspace.js';
import { createProject } from '../../src/storage/project.js';
import {
  STARTER_PERMISSIONS, STARTER_WORKFLOW, starterPermissions,
} from '../../src/storage/templates.js';
import { makeTmpProject, makeBareProject, writeYaml } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('ensureWorkspaceSeeded', () => {
  it('seeds one registered Development workflow with its states on disk', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeYaml(path.join(tp.root, 'workspace.yaml'), 'name: WS\nworkflows: []\n');

    const seeded = await ensureWorkspaceSeeded(tp.root);
    expect(seeded).toBe('development');

    const meta = await readWorkspace(tp.root);
    expect(meta.config.workflows).toEqual(['workflows/development']);

    const wf = path.join(tp.root, 'workflows/development');
    expect(await exists(path.join(wf, 'workflow.yaml'))).toBe(true);
    expect(await exists(path.join(wf, 'permissions.yaml'))).toBe(true);
    const dirs = (await readdir(wf, { withFileTypes: true }))
      .filter(e => e.isDirectory()).map(e => e.name).sort();
    expect(dirs).toEqual(STARTER_WORKFLOW.states.map(s => s.dir).sort());
  });

  it('writes a PROCESS.md carrying every state heading, not a fill-in stub', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeYaml(path.join(tp.root, 'workspace.yaml'), 'name: WS\nworkflows: []\n');
    await ensureWorkspaceSeeded(tp.root);

    const doc = await readFile(path.join(tp.root, 'workflows/development/PROCESS.md'), 'utf8');
    for (const s of STARTER_WORKFLOW.states) expect(doc).toContain(`## ${s.name}`);
    expect(doc).not.toContain('Describe when a ticket enters this state');
  });

  // A user who deletes the starter workflow must not get it back on the next read.
  it('is a no-op on a workspace that already has a registered workflow', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await ensureWorkspaceSeeded(tp.root);
    const again = await ensureWorkspaceSeeded(tp.root);
    expect(again).toBeNull();

    const meta = await readWorkspace(tp.root);
    expect(meta.config.workflows).toEqual(['workflows/development']);
  });
});

describe('readWorkspace seeding', () => {
  it('seeds only on the auto-create branch, and leaves workflows: [] alone', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const meta = await readWorkspace(tp.root);
    expect(meta.config.workflows).toEqual([]);
    expect(await exists(path.join(tp.root, 'workflows'))).toBe(false);
  });

  it('opens the workspace anyway when seeding fails', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    // A file where the workflows directory needs to be: createWorkflow throws,
    // and the workspace must still open — empty rather than unopenable.
    await writeYaml(path.join(tp.root, 'workflows'), 'not a directory');

    const meta = await readWorkspace(tp.root);
    expect(meta.config.name).toBe(path.basename(tp.root));
    expect(meta.config.workflows).toEqual([]);
  });
});

describe('starter permissions', () => {
  it('substitutes the root placeholder without mutating the template', async () => {
    const resolved = starterPermissions('/repos/thing');
    expect(resolved.allowedTools).toEqual(['Read(/repos/thing/**)']);
    expect(resolved.allowedPaths).toEqual([]);
    expect(resolved.deniedTools).toEqual([]);
    expect(STARTER_PERMISSIONS.allowedTools).toEqual(['Read({root}/**)']);
  });

  // Read access to a repository and write access to it are different decisions;
  // registering a codebase implies only the first.
  it('grants no Write or Edit', () => {
    const all = [
      ...STARTER_PERMISSIONS.allowedTools,
      ...STARTER_PERMISSIONS.allowedPaths,
    ].join(' ');
    expect(all).not.toMatch(/Write\(|Edit\(/);
  });

  it('seeds a project created without permissions, and yields to supplied ones', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await createProject(tp.root, { name: 'Seeded', root: tp.root });
    const seeded = await readFile(path.join(tp.root, 'projects/seeded.yaml'), 'utf8');
    expect(seeded).toContain(`Read(${tp.root}/**)`);

    await createProject(tp.root, {
      name: 'Explicit',
      root: tp.root,
      permissions: { allowedPaths: [], allowedTools: ['Bash(ls *)'], deniedTools: [] },
    });
    const explicit = await readFile(path.join(tp.root, 'projects/explicit.yaml'), 'utf8');
    expect(explicit).toContain('Bash(ls *)');
    expect(explicit).not.toContain('Read(');
  });
});

// The regression this phase fixes was an orphaned export: the workflow collapse
// left the starter templates with no importers and nobody noticed.
describe('template exports are live', () => {
  it('has an importer for STARTER_WORKFLOW and no trace of boardContextTemplate', async () => {
    const templates = await readFile('src/storage/templates.ts', 'utf8');
    expect(templates).not.toContain('boardContextTemplate');

    const seed = await readFile('src/storage/seed.ts', 'utf8');
    expect(seed).toContain('STARTER_WORKFLOW');
    expect(seed).toContain('STARTER_WORKFLOW_PROCESS');

    const project = await readFile('src/storage/project.ts', 'utf8');
    expect(project).toContain('starterPermissions');
  });
});
