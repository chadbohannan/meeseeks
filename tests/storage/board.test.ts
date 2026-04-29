import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { createBoard, renameBoard, deleteBoardFolder, readBoardDetail } from '../../src/storage/board.js';
import { addBoardToProject, listBoards } from '../../src/storage/project.js';
import { ConflictError, NotFoundError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('createBoard', () => {
  it('creates folder, CLAUDE.md, board.yaml, lanes/', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');

    await createBoard(boardPath, 'My Board');
    expect(await exists(path.join(boardPath, 'CLAUDE.md'))).toBe(true);
    expect(await exists(path.join(boardPath, 'board.yaml'))).toBe(true);
    expect(await exists(path.join(boardPath, 'lanes'))).toBe(true);

    const claudeMd = await readFile(path.join(boardPath, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('My Board');
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
  it('returns lane summaries for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const detail = await readBoardDetail(boardPath, { boardId: 'b', name: 'B' });
    expect(detail.lanes).toEqual([]);
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

describe('readBoardClaudeContent', () => {
  it('returns CLAUDE.md content for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const { readBoardClaudeContent } = await import('../../src/storage/board.js');
    const content = await readBoardClaudeContent(boardPath);

    expect(content).toContain('My Board');
    expect(content).toContain('Board-level instructions');
  });

  it('returns default content when CLAUDE.md is missing', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/missing');

    const { readBoardClaudeContent } = await import('../../src/storage/board.js');
    const content = await readBoardClaudeContent(boardPath);

    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });
});

describe('writeBoardClaudeContent', () => {
  it('writes content to CLAUDE.md', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const { writeBoardClaudeContent, readBoardClaudeContent } = await import('../../src/storage/board.js');
    const newContent = '# Custom Instructions\n\nTest content';
    await writeBoardClaudeContent(boardPath, newContent);

    const readBack = await readBoardClaudeContent(boardPath);
    expect(readBack).toBe(newContent);
  });

  it('overwrites existing CLAUDE.md content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');

    const { writeBoardClaudeContent, readBoardClaudeContent } = await import('../../src/storage/board.js');

    await writeBoardClaudeContent(boardPath, 'First version');
    const first = await readBoardClaudeContent(boardPath);
    expect(first).toBe('First version');

    await writeBoardClaudeContent(boardPath, 'Second version');
    const second = await readBoardClaudeContent(boardPath);
    expect(second).toBe('Second version');
  });

  it('throws NotFoundError when board path does not exist', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const invalidPath = path.join(tp.root, 'boards/nonexistent');

    const { writeBoardClaudeContent } = await import('../../src/storage/board.js');

    await expect(
      writeBoardClaudeContent(invalidPath, 'content')
    ).rejects.toThrow(NotFoundError);
  });
});
