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

function promptsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'prompts');
}

function validateName(name: string): void {
  if (!name || typeof name !== 'string') throw new InvalidInputError('prompt name required');
  if (path.isAbsolute(name)) throw new InvalidInputError('absolute paths not allowed');
  if (!name.endsWith('.md')) throw new InvalidInputError('prompt files must have .md extension');
}

function resolvePromptPath(workspaceRoot: string, name: string): string {
  validateName(name);
  try {
    return resolveWithin(promptsDir(workspaceRoot), name);
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new InvalidInputError('path traversal not allowed');
    }
    throw err;
  }
}

export async function listPrompts(workspaceRoot: string): Promise<PromptSummary[]> {
  const dir = promptsDir(workspaceRoot);
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

export async function readPrompt(workspaceRoot: string, name: string): Promise<{ name: string; body: string }> {
  const full = resolvePromptPath(workspaceRoot, name);
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

export async function writePrompt(workspaceRoot: string, name: string, body: string): Promise<{ name: string }> {
  const full = resolvePromptPath(workspaceRoot, name);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body, 'utf8');
  return { name };
}

export async function deletePrompt(workspaceRoot: string, name: string): Promise<void> {
  const full = resolvePromptPath(workspaceRoot, name);
  try {
    await unlink(full);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`prompt not found: ${name}`);
    }
    throw err;
  }
}

export async function promptExists(workspaceRoot: string, name: string): Promise<boolean> {
  const full = resolvePromptPath(workspaceRoot, name);
  try { await access(full); return true; } catch { return false; }
}

function logsDir(workspaceRoot: string, promptName: string): string {
  const slug = promptName.replace(/\.md$/i, '');
  return path.join(workspaceRoot, 'prompts', '.logs', slug);
}

export async function appendRunLog(workspaceRoot: string, promptName: string, entry: PromptRunLog): Promise<void> {
  const dir = logsDir(workspaceRoot, promptName);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(entry) + '\n';
  await appendFile(path.join(dir, 'runs.jsonl'), line, 'utf8');
}

export async function listRunLogs(workspaceRoot: string, promptName: string, limit = 50): Promise<PromptRunLog[]> {
  const file = path.join(logsDir(workspaceRoot, promptName), 'runs.jsonl');
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
