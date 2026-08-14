// tests/storage/files.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { writeFile as fsWriteFile, access, mkdir } from 'node:fs/promises';
import { listFiles, readFile, writeFile, deleteFile } from '../../src/storage/files.js';
import { NotFoundError, InvalidInputError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('listFiles', () => {
  it('returns empty array for empty skills directory', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    const files = await listFiles(wsRoot, 'skills');
    expect(files).toEqual([]);
  });

  it('lists skill files with metadata', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;
    const skillsDir = path.join(wsRoot, '.claude/skills');
    await mkdir(skillsDir, { recursive: true });
    await fsWriteFile(path.join(skillsDir, 'test.md'), 'content', 'utf8');

    const files = await listFiles(wsRoot, 'skills');
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('test.md');
    expect(files[0]!.isDirectory).toBe(false);
    expect(files[0]!.size).toBeGreaterThan(0);
    expect(files[0]!.modified).toBeTruthy();
  });

  it('rejects invalid namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(listFiles(wsRoot, 'invalid')).rejects.toThrow(InvalidInputError);
  });
});

describe('readFile', () => {
  it('reads skill file content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;
    const skillsDir = path.join(wsRoot, '.claude/skills');
    await mkdir(skillsDir, { recursive: true });
    await fsWriteFile(path.join(skillsDir, 'test.md'), 'hello world', 'utf8');

    const content = await readFile(wsRoot, 'skills', 'test.md');
    expect(content).toBe('hello world');
  });

  it('throws NotFoundError for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(readFile(wsRoot, 'skills', 'missing.md')).rejects.toThrow(NotFoundError);
  });

  it('rejects path traversal with ..', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(readFile(wsRoot, 'skills', '../../../etc/passwd')).rejects.toThrow(InvalidInputError);
  });

  it('rejects absolute paths', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(readFile(wsRoot, 'skills', '/etc/passwd')).rejects.toThrow(InvalidInputError);
  });
});

describe('writeFile', () => {
  it('creates skill file with content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await writeFile(wsRoot, 'skills', 'new.md', 'content');

    const filePath = path.join(wsRoot, '.claude/skills/new.md');
    expect(await exists(filePath)).toBe(true);
    const content = await readFile(wsRoot, 'skills', 'new.md');
    expect(content).toBe('content');
  });

  it('creates .claude/skills directory if missing', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    const skillsDir = path.join(wsRoot, '.claude/skills');
    expect(await exists(skillsDir)).toBe(false);

    await writeFile(wsRoot, 'skills', 'test.md', 'content');
    expect(await exists(skillsDir)).toBe(true);
  });

  it('rejects files without .md extension in skills namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(writeFile(wsRoot, 'skills', 'test.txt', 'content')).rejects.toThrow(InvalidInputError);
  });

  it('rejects path traversal', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(writeFile(wsRoot, 'skills', '../escape.md', 'content')).rejects.toThrow(InvalidInputError);
  });
});

describe('deleteFile', () => {
  it('deletes existing skill file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;
    await writeFile(wsRoot, 'skills', 'test.md', 'content');

    await deleteFile(wsRoot, 'skills', 'test.md');

    const filePath = path.join(wsRoot, '.claude/skills/test.md');
    expect(await exists(filePath)).toBe(false);
  });

  it('throws NotFoundError for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const wsRoot = tp.root;

    await expect(deleteFile(wsRoot, 'skills', 'missing.md')).rejects.toThrow(NotFoundError);
  });
});
