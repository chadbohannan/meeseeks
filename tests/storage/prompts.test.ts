import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { writeFile as fsWriteFile, mkdir, access } from 'node:fs/promises';
import { listPrompts, readPrompt, writePrompt, deletePrompt, promptExists } from '../../src/storage/prompts.js';
import { buildPromptFilename } from '../../src/storage/paths.js';
import { createBoard } from '../../src/storage/board.js';
import { NotFoundError, InvalidInputError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const boardPath = path.join(tp.root, 'boards/b');
  await createBoard(boardPath, 'B');
  return boardPath;
}

describe('listPrompts', () => {
  it('returns empty when prompts dir does not exist', async () => {
    const bp = await setup();
    expect(await listPrompts(bp)).toEqual([]);
  });

  it('lists .md files only, sorted', async () => {
    const bp = await setup();
    const dir = path.join(bp, 'prompts');
    await mkdir(dir, { recursive: true });
    await fsWriteFile(path.join(dir, 'b.md'), 'B', 'utf8');
    await fsWriteFile(path.join(dir, 'a.md'), 'A', 'utf8');
    await fsWriteFile(path.join(dir, 'note.txt'), 'no', 'utf8');
    const list = await listPrompts(bp);
    expect(list.map(p => p.name)).toEqual(['a.md', 'b.md']);
    expect(list[0]!.size).toBe(1);
  });
});

describe('writePrompt / readPrompt', () => {
  it('writes and reads', async () => {
    const bp = await setup();
    await writePrompt(bp, 'foo.md', 'hello');
    const r = await readPrompt(bp, 'foo.md');
    expect(r.body).toBe('hello');
    expect(await exists(path.join(bp, 'prompts', 'foo.md'))).toBe(true);
  });

  it('rejects non-md names', async () => {
    const bp = await setup();
    await expect(writePrompt(bp, 'foo.txt', 'x')).rejects.toThrow(InvalidInputError);
  });

  it('rejects path traversal', async () => {
    const bp = await setup();
    await expect(writePrompt(bp, '../escape.md', 'x')).rejects.toThrow(InvalidInputError);
    await expect(readPrompt(bp, '../escape.md')).rejects.toThrow(InvalidInputError);
  });

  it('readPrompt throws NotFoundError when missing', async () => {
    const bp = await setup();
    await expect(readPrompt(bp, 'missing.md')).rejects.toThrow(NotFoundError);
  });
});

describe('deletePrompt', () => {
  it('removes file', async () => {
    const bp = await setup();
    await writePrompt(bp, 'foo.md', 'x');
    await deletePrompt(bp, 'foo.md');
    expect(await exists(path.join(bp, 'prompts', 'foo.md'))).toBe(false);
  });

  it('throws NotFoundError when missing', async () => {
    const bp = await setup();
    await expect(deletePrompt(bp, 'missing.md')).rejects.toThrow(NotFoundError);
  });
});

describe('promptExists', () => {
  it('reflects file presence', async () => {
    const bp = await setup();
    expect(await promptExists(bp, 'foo.md')).toBe(false);
    await writePrompt(bp, 'foo.md', 'x');
    expect(await promptExists(bp, 'foo.md')).toBe(true);
  });
});

describe('buildPromptFilename', () => {
  it('slugifies and appends .md', () => {
    expect(buildPromptFilename('Weekly Report!')).toBe('weekly-report.md');
    expect(buildPromptFilename('  ')).toBe('untitled.md');
    expect(buildPromptFilename('foo.md')).toBe('foo.md');
  });
});
