import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readProject, createProject, listBoards, addBoardToProject } from '../../src/storage/project.js';
import { NotFoundError, ConflictError } from '../../src/storage/errors.js';
import { makeTmpProject, makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('createProject', () => {
  it('writes a project.meeseeks file', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);

    const meta = await createProject(tp.root, 'My Proj');
    expect(meta.config.name).toBe('My Proj');
    expect(meta.config.boards).toEqual([]);

    const text = await readFile(path.join(tp.root, 'project.meeseeks'), 'utf8');
    expect(text).toContain('name: My Proj');
  });

  it('rejects an existing project file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await expect(createProject(tp.root, 'Other')).rejects.toThrow(ConflictError);
  });
});

describe('readProject', () => {
  it('returns parsed config', async () => {
    const tp = await makeBareProject('Hello');
    cleanups.push(tp.cleanup);
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('Hello');
  });

  it('throws NotFoundError when project.meeseeks missing', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await expect(readProject(tp.root)).rejects.toThrow(NotFoundError);
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
