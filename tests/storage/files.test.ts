// tests/storage/files.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { writeFile as fsWriteFile, access } from 'node:fs/promises';
import { listFiles, readFile, writeFile, deleteFile } from '../../src/storage/files.js';
import { createBoard } from '../../src/storage/board.js';
import { NotFoundError, InvalidInputError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('listFiles', () => {
  it('returns empty array for empty skills directory', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    const files = await listFiles(boardPath, 'skills');
    expect(files).toEqual([]);
  });

  it('lists skill files with metadata', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const skillsDir = path.join(boardPath, '.claude/skills');
    await fsWriteFile(path.join(skillsDir, 'test.md'), 'content', 'utf8');

    const files = await listFiles(boardPath, 'skills');
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('test.md');
    expect(files[0]!.isDirectory).toBe(false);
    expect(files[0]!.size).toBeGreaterThan(0);
    expect(files[0]!.modified).toBeTruthy();
  });

  it('rejects invalid namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(listFiles(boardPath, 'invalid')).rejects.toThrow(InvalidInputError);
  });
});

describe('readFile', () => {
  it('reads skill file content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const skillsDir = path.join(boardPath, '.claude/skills');
    await fsWriteFile(path.join(skillsDir, 'test.md'), 'hello world', 'utf8');

    const content = await readFile(boardPath, 'skills', 'test.md');
    expect(content).toBe('hello world');
  });

  it('throws NotFoundError for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(readFile(boardPath, 'skills', 'missing.md')).rejects.toThrow(NotFoundError);
  });

  it('rejects path traversal with ..', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(readFile(boardPath, 'skills', '../../../etc/passwd')).rejects.toThrow(InvalidInputError);
  });

  it('rejects absolute paths', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(readFile(boardPath, 'skills', '/etc/passwd')).rejects.toThrow(InvalidInputError);
  });
});

describe('writeFile', () => {
  it('creates skill file with content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await writeFile(boardPath, 'skills', 'new.md', 'content');

    const filePath = path.join(boardPath, '.claude/skills/new.md');
    expect(await exists(filePath)).toBe(true);
    const content = await readFile(boardPath, 'skills', 'new.md');
    expect(content).toBe('content');
  });

  it('creates .claude/skills directory if missing', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    const skillsDir = path.join(boardPath, '.claude/skills');
    expect(await exists(skillsDir)).toBe(false);

    await writeFile(boardPath, 'skills', 'test.md', 'content');
    expect(await exists(skillsDir)).toBe(true);
  });

  it('rejects files without .md extension in skills namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(writeFile(boardPath, 'skills', 'test.txt', 'content')).rejects.toThrow(InvalidInputError);
  });

  it('rejects path traversal', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(writeFile(boardPath, 'skills', '../escape.md', 'content')).rejects.toThrow(InvalidInputError);
  });
});

describe('deleteFile', () => {
  it('deletes existing skill file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await writeFile(boardPath, 'skills', 'test.md', 'content');

    await deleteFile(boardPath, 'skills', 'test.md');

    const filePath = path.join(boardPath, '.claude/skills/test.md');
    expect(await exists(filePath)).toBe(false);
  });

  it('throws NotFoundError for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await expect(deleteFile(boardPath, 'skills', 'missing.md')).rejects.toThrow(NotFoundError);
  });
});
