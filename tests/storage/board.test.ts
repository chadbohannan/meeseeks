import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createBoard, renameBoard, deleteBoardFolder, readBoardDetail } from '../../src/storage/board.js';
import { addBoardToProject, listBoards } from '../../src/storage/project.js';
import { ConflictError, NotFoundError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('createBoard', () => {
  it('creates folder, CONTEXT.md, board.yaml, lanes/', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');

    await createBoard(boardPath, 'My Board');
    expect(await exists(path.join(boardPath, 'CONTEXT.md'))).toBe(true);
    expect(await exists(path.join(boardPath, 'board.yaml'))).toBe(true);
    expect(await exists(path.join(boardPath, 'lanes'))).toBe(true);

    const contextMd = await readFile(path.join(boardPath, 'CONTEXT.md'), 'utf8');
    expect(contextMd).toContain('My Board');
  });

  it('seeds a ready-to-use Development lane', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const lanePath = path.join(boardPath, 'lanes/development');
    expect(await exists(path.join(lanePath, 'lane.yaml'))).toBe(true);
    for (const dir of ['todo', 'in-progress', 'review', 'done']) {
      expect(await exists(path.join(lanePath, dir))).toBe(true);
    }
    const process = await readFile(path.join(lanePath, 'PROCESS.md'), 'utf8');
    expect(process).toContain('Development Process');
  });

  it('rejects existing folder', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');
    await expect(createBoard(boardPath, 'Again')).rejects.toThrow(ConflictError);
  });
});

describe('readBoardDetail', () => {
  it('returns lane summaries and contextContent for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const detail = await readBoardDetail(boardPath, { boardId: 'b', name: 'B' });
    expect(detail.lanes).toHaveLength(1);
    expect(detail.lanes[0]!.displayName).toBe('Development');
    expect(detail.contextContent).toBeTruthy();
    expect(detail.contextContent).toContain('B');
  });
});

describe('renameBoard', () => {
  it('renames the directory and updates project entry', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/old');
    await createBoard(boardPath, 'Old');
    await addBoardToProject(tp.root, 'boards/old');

    const newPath = path.join(tp.root, 'boards/renamed');
    await renameBoard(tp.root, 'boards/old', 'boards/renamed');

    expect(await exists(boardPath)).toBe(false);
    expect(await exists(newPath)).toBe(true);
    const list = await listBoards(tp.root);
    expect(list[0]!.path).toBe(newPath);
  });
});

describe('deleteBoardFolder', () => {
  it('removes the directory tree', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await deleteBoardFolder(boardPath);
    expect(await exists(boardPath)).toBe(false);
  });

  it('throws NotFoundError when folder absent', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await expect(deleteBoardFolder(path.join(tp.root, 'nope'))).rejects.toThrow(NotFoundError);
  });
});

describe('readBoardContextContent', () => {
  it('returns CONTEXT.md content for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const { readBoardContextContent } = await import('../../src/storage/board.js');
    const content = await readBoardContextContent(boardPath);

    expect(content).toContain('My Board');
    expect(content).toContain('Context for agents');
  });

  it('returns default content when CONTEXT.md is missing', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/missing');

    const { readBoardContextContent } = await import('../../src/storage/board.js');
    const content = await readBoardContextContent(boardPath);

    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });

  it('auto-migrates legacy CLAUDE.md to CONTEXT.md on read', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/legacy');
    await createBoard(boardPath, 'Legacy');

    // Simulate a board created before the rename: move CONTEXT.md back to CLAUDE.md.
    const contextPath = path.join(boardPath, 'CONTEXT.md');
    const legacyPath = path.join(boardPath, 'CLAUDE.md');
    const original = await readFile(contextPath, 'utf8');
    await writeFile(legacyPath, original, 'utf8');
    const { rm } = await import('node:fs/promises');
    await rm(contextPath);

    const { readBoardContextContent } = await import('../../src/storage/board.js');
    const content = await readBoardContextContent(boardPath);

    expect(content).toBe(original);
    expect(await exists(contextPath)).toBe(true);
    expect(await exists(legacyPath)).toBe(false);
  });
});

describe('writeBoardContextContent', () => {
  it('writes content to CONTEXT.md', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const { writeBoardContextContent, readBoardContextContent } = await import('../../src/storage/board.js');
    const newContent = '# Custom Instructions\n\nTest content';
    await writeBoardContextContent(boardPath, newContent);

    const readBack = await readBoardContextContent(boardPath);
    expect(readBack).toBe(newContent);
  });

  it('overwrites existing CONTEXT.md content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const { writeBoardContextContent, readBoardContextContent } = await import('../../src/storage/board.js');

    await writeBoardContextContent(boardPath, 'First version');
    const first = await readBoardContextContent(boardPath);
    expect(first).toBe('First version');

    await writeBoardContextContent(boardPath, 'Second version');
    const second = await readBoardContextContent(boardPath);
    expect(second).toBe('Second version');
  });

  it('throws NotFoundError when board path does not exist', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const invalidPath = path.join(tp.root, 'boards/nonexistent');

    const { writeBoardContextContent } = await import('../../src/storage/board.js');

    await expect(
      writeBoardContextContent(invalidPath, 'content')
    ).rejects.toThrow(NotFoundError);
  });
});
