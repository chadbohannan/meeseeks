import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readWorkspace, listWorkflowEntries, addWorkflowToWorkspace, getModels, DEFAULT_MODELS } from '../../src/storage/workspace.js';
import { ConflictError } from '../../src/storage/errors.js';
import { makeTmpProject, makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('readWorkspace', () => {
  it('reads workspace.yaml when present', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeFile(path.join(tp.root, 'workspace.yaml'), 'name: YamlProj\nworkflows: []\n', 'utf8');
    const meta = await readWorkspace(tp.root);
    expect(meta.config.name).toBe('YamlProj');
  });

  // The pre-collapse config named `boards:`, which this code cannot interpret.
  // Reading it would present an empty workspace as a valid one; instead the old
  // file is ignored entirely and a fresh config is written beside it.
  it('does not read a pre-collapse project.yaml', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeFile(
      path.join(tp.root, 'project.yaml'),
      'name: OldWorkspace\nboards:\n  - boards/dev\n',
      'utf8',
    );
    const meta = await readWorkspace(tp.root);
    expect(meta.config.name).toBe(path.basename(tp.root));
    // Auto-created, and therefore seeded with the starter workflow.
    expect(meta.config.workflows).toEqual(['workflows/development']);
    // The old file is left untouched for the migration to consume later.
    const old = await readFile(path.join(tp.root, 'project.yaml'), 'utf8');
    expect(old).toContain('boards:');
  });

  it('auto-creates workspace.yaml from directory name when no config exists', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    const meta = await readWorkspace(tp.root);
    expect(meta.config.name).toBe(path.basename(tp.root));
    expect(meta.config.workflows).toEqual(['workflows/development']);
    // file was created on disk
    const text = await readFile(path.join(tp.root, 'workspace.yaml'), 'utf8');
    expect(text).toContain(`name: ${path.basename(tp.root)}`);
  });
});

describe('getModels', () => {
  it('returns the default model aliases when project.yaml has no models key', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    expect(await getModels(tp.root)).toEqual(DEFAULT_MODELS);
  });

  it('returns the configured models when project.yaml defines them', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeFile(
      path.join(tp.root, 'workspace.yaml'),
      'name: P\nworkflows: []\nmodels:\n  - value: opus\n    label: Big Opus\n  - value: claude-haiku-4-5-20251001\n    label: Pinned Haiku\n',
      'utf8',
    );
    expect(await getModels(tp.root)).toEqual([
      { value: 'opus', label: 'Big Opus' },
      { value: 'claude-haiku-4-5-20251001', label: 'Pinned Haiku' },
    ]);
  });

  it('ignores malformed model entries and falls back to defaults when none are valid', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeFile(
      path.join(tp.root, 'workspace.yaml'),
      'name: P\nworkflows: []\nmodels:\n  - value: 123\n  - label: no-value\n',
      'utf8',
    );
    expect(await getModels(tp.root)).toEqual(DEFAULT_MODELS);
  });
});

describe('listWorkflowEntries / addWorkflowToWorkspace', () => {
  it('returns empty list initially', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    expect(await listWorkflowEntries(tp.root)).toEqual([]);
  });

  it('adds a workflow entry and reports availability', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wfPath = path.join(tp.root, 'workflows/b1');
    await mkdir(wfPath, { recursive: true });

    await addWorkflowToWorkspace(tp.root, 'workflows/b1');
    const list = await listWorkflowEntries(tp.root);
    expect(list).toHaveLength(1);
    expect(list[0]!.workflowName).toBe('b1');
    expect(list[0]!.available).toBe(true);
  });

  it('flags missing folders as unavailable', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await addWorkflowToWorkspace(tp.root, 'workflows/missing');
    const list = await listWorkflowEntries(tp.root);
    expect(list[0]!.available).toBe(false);
  });
});
