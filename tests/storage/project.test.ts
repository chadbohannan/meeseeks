import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readProject, listBoards, addBoardToProject, getModels, DEFAULT_MODELS } from '../../src/storage/project.js';
import { ConflictError } from '../../src/storage/errors.js';
import { makeTmpProject, makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('readProject', () => {
  it('reads project.yaml when present', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeFile(path.join(tp.root, 'project.yaml'), 'name: YamlProj\nboards: []\n', 'utf8');
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('YamlProj');
  });

  it('falls back to project.meeseeks when project.yaml absent', async () => {
    const tp = await makeBareProject('LegacyProj');  // writes project.meeseeks
    cleanups.push(tp.cleanup);
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('LegacyProj');
  });

  it('prefers project.yaml over project.meeseeks when both present', async () => {
    const tp = await makeBareProject('LegacyName');
    cleanups.push(tp.cleanup);
    await writeFile(path.join(tp.root, 'project.yaml'), 'name: NewName\nboards: []\n', 'utf8');
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('NewName');
  });

  it('auto-creates project.yaml from directory name when neither file exists', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe(path.basename(tp.root));
    expect(meta.config.boards).toEqual([]);
    // file was created on disk
    const text = await readFile(path.join(tp.root, 'project.yaml'), 'utf8');
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
      path.join(tp.root, 'project.yaml'),
      'name: P\nboards: []\nmodels:\n  - value: opus\n    label: Big Opus\n  - value: claude-haiku-4-5-20251001\n    label: Pinned Haiku\n',
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
      path.join(tp.root, 'project.yaml'),
      'name: P\nboards: []\nmodels:\n  - value: 123\n  - label: no-value\n',
      'utf8',
    );
    expect(await getModels(tp.root)).toEqual(DEFAULT_MODELS);
  });
});

describe('listBoards / addBoardToProject', () => {
  it('returns empty list initially', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    expect(await listBoards(tp.root)).toEqual([]);
  });

  it('adds a board entry and reports availability', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b1');
    await mkdir(boardPath, { recursive: true });

    await addBoardToProject(tp.root, 'boards/b1');
    const list = await listBoards(tp.root);
    expect(list).toHaveLength(1);
    expect(list[0]!.boardId).toBe('b1');
    expect(list[0]!.available).toBe(true);
  });

  it('flags missing folders as unavailable', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await addBoardToProject(tp.root, 'boards/missing');
    const list = await listBoards(tp.root);
    expect(list[0]!.available).toBe(false);
  });
});
