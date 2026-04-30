// src/storage/files.ts
import { readdir, readFile as fsReadFile, writeFile as fsWriteFile, unlink, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError, InvalidInputError } from './errors.js';
import type { FileNode } from '../shared/types.js';

const NAMESPACE_DIRS: Record<string, string> = {
  skills: '.claude/skills',
  prompts: '.claude/prompts',
  hooks: '.claude/hooks',
};

function validateNamespace(namespace: string): void {
  if (!NAMESPACE_DIRS[namespace]) {
    throw new InvalidInputError(`unsupported namespace: ${namespace}`);
  }
}

function validateFilepath(filepath: string): void {
  if (filepath.includes('..')) {
    throw new InvalidInputError('path traversal not allowed');
  }
  if (path.isAbsolute(filepath)) {
    throw new InvalidInputError('absolute paths not allowed');
  }
}

function validateSkillFilename(filename: string): void {
  if (!filename.endsWith('.md')) {
    throw new InvalidInputError('skill files must have .md extension');
  }
}

async function ensureNamespaceDir(boardPath: string, namespace: string): Promise<string> {
  const dir = path.join(boardPath, NAMESPACE_DIRS[namespace]!);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function listFiles(boardPath: string, namespace: string): Promise<FileNode[]> {
  validateNamespace(namespace);
  const dir = await ensureNamespaceDir(boardPath, namespace);

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const stats = await stat(path.join(dir, entry.name));
      nodes.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });
    }

    return nodes;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function readFile(boardPath: string, namespace: string, filepath: string): Promise<string> {
  validateNamespace(namespace);
  validateFilepath(filepath);

  const fullPath = path.join(boardPath, NAMESPACE_DIRS[namespace]!, filepath);

  try {
    return await fsReadFile(fullPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`file not found: ${filepath}`);
    }
    throw err;
  }
}

export async function writeFile(
  boardPath: string,
  namespace: string,
  filepath: string,
  content: string,
): Promise<void> {
  validateNamespace(namespace);
  validateFilepath(filepath);

  if (namespace === 'skills') {
    validateSkillFilename(filepath);
  }

  const dir = await ensureNamespaceDir(boardPath, namespace);
  const fullPath = path.join(dir, filepath);
  await fsWriteFile(fullPath, content, 'utf8');
}

export async function deleteFile(boardPath: string, namespace: string, filepath: string): Promise<void> {
  validateNamespace(namespace);
  validateFilepath(filepath);

  const fullPath = path.join(boardPath, NAMESPACE_DIRS[namespace]!, filepath);

  try {
    await unlink(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`file not found: ${filepath}`);
    }
    throw err;
  }
}
