import { readdir, readFile, writeFile, unlink, mkdir, stat, access, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError, InvalidInputError, PathSafetyError } from './errors.js';
import { resolveWithin, buildPromptFilename } from './paths.js';
import type { PromptRunLog } from '../shared/api.js';

export interface PromptSummary {
  name: string;          // filename, e.g. "weekly-report.md"
  size: number;
  modified: string;      // ISO
}

function promptsDir(boardPath: string): string {
  return path.join(boardPath, 'prompts');
}

function validateName(name: string): void {
  if (!name || typeof name !== 'string') throw new InvalidInputError('prompt name required');
  if (path.isAbsolute(name)) throw new InvalidInputError('absolute paths not allowed');
  if (!name.endsWith('.md')) throw new InvalidInputError('prompt files must have .md extension');
}

function resolvePromptPath(boardPath: string, name: string): string {
  validateName(name);
  try {
    return resolveWithin(promptsDir(boardPath), name);
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new InvalidInputError('path traversal not allowed');
    }
    throw err;
  }
}

export async function listPrompts(boardPath: string): Promise<PromptSummary[]> {
  const dir = promptsDir(boardPath);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: PromptSummary[] = [];
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    const stats = await stat(full);
    if (!stats.isFile()) continue;
    out.push({ name, size: stats.size, modified: stats.mtime.toISOString() });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function readPrompt(boardPath: string, name: string): Promise<{ name: string; body: string }> {
  const full = resolvePromptPath(boardPath, name);
  try {
    const body = await readFile(full, 'utf8');
    return { name, body };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`prompt not found: ${name}`);
    }
    throw err;
  }
}

export async function writePrompt(boardPath: string, name: string, body: string): Promise<{ name: string }> {
  const full = resolvePromptPath(boardPath, name);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body, 'utf8');
  return { name };
}

export async function deletePrompt(boardPath: string, name: string): Promise<void> {
  const full = resolvePromptPath(boardPath, name);
  try {
    await unlink(full);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`prompt not found: ${name}`);
    }
    throw err;
  }
}

export async function promptExists(boardPath: string, name: string): Promise<boolean> {
  const full = resolvePromptPath(boardPath, name);
  try { await access(full); return true; } catch { return false; }
}

function logsDir(boardPath: string, promptName: string): string {
  const slug = promptName.replace(/\.md$/i, '');
  return path.join(boardPath, 'prompts', '.logs', slug);
}

export async function appendRunLog(boardPath: string, promptName: string, entry: PromptRunLog): Promise<void> {
  const dir = logsDir(boardPath, promptName);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(entry) + '\n';
  await appendFile(path.join(dir, 'runs.jsonl'), line, 'utf8');
}

export async function listRunLogs(boardPath: string, promptName: string, limit = 50): Promise<PromptRunLog[]> {
  const file = path.join(logsDir(boardPath, promptName), 'runs.jsonl');
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const logs: PromptRunLog[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { logs.push(JSON.parse(trimmed) as PromptRunLog); } catch { /* skip malformed */ }
  }
  return logs.slice(-limit).reverse();
}

export { buildPromptFilename };
