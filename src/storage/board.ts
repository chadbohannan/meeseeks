import { mkdir, rename, rm, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError } from './errors.js';
import { readProject, writeProject } from './project.js';
import { listLanes } from './lane.js';
import type { BoardDetail } from '../shared/types.js';

const DEFAULT_BOARD_YAML = (name: string) => yaml.dump({
  name,
  runtime: {
    harness: 'claude-code',
    provider: 'anthropic',
    model: 'opus',
    args: [],
    env: {},
  },
});

const DEFAULT_CONTEXT_MD = (name: string) => `# ${name}\n\nBoard-level instructions for agents go here.\n`;

export async function readBoardContextContent(boardPath: string): Promise<string> {
  const contextPath = path.join(boardPath, 'CONTEXT.md');
  try {
    return await readFile(contextPath, 'utf8');
  } catch {
    const legacyPath = path.join(boardPath, 'CLAUDE.md');
    if (await exists(legacyPath)) {
      await rename(legacyPath, contextPath);
      return await readFile(contextPath, 'utf8');
    }
    return DEFAULT_CONTEXT_MD('');
  }
}

export async function writeBoardContextContent(boardPath: string, content: string): Promise<void> {
  if (!(await exists(boardPath))) {
    throw new NotFoundError(`board not found: ${boardPath}`);
  }
  const contextPath = path.join(boardPath, 'CONTEXT.md');
  await writeFile(contextPath, content, 'utf8');
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function readBoardName(boardPath: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(boardPath, 'board.yaml'), 'utf8');
    const parsed = yaml.load(raw) as { name?: string } | null;
    return parsed?.name ?? null;
  } catch {
    return null;
  }
}

export async function updateBoardName(boardPath: string, name: string): Promise<void> {
  const yamlPath = path.join(boardPath, 'board.yaml');
  let parsed: Record<string, unknown> = {};
  try {
    const raw = await readFile(yamlPath, 'utf8');
    parsed = (yaml.load(raw) as Record<string, unknown>) ?? {};
  } catch { /* fresh file */ }
  parsed.name = name;
  await writeFile(yamlPath, yaml.dump(parsed), 'utf8');
}

export async function createBoard(boardPath: string, name: string): Promise<void> {
  if (!name || typeof name !== 'string') throw new InvalidInputError('board name required');
  if (await exists(boardPath)) throw new ConflictError(`board folder already exists: ${boardPath}`);
  await mkdir(path.join(boardPath, 'lanes'), { recursive: true });
  await writeFile(path.join(boardPath, 'CONTEXT.md'), DEFAULT_CONTEXT_MD(name), 'utf8');
  await writeFile(path.join(boardPath, 'board.yaml'), DEFAULT_BOARD_YAML(name), 'utf8');
  await writeFile(path.join(boardPath, '.gitignore'), '.meeseeks/\n', 'utf8');
}

export async function readBoardDetail(
  boardPath: string,
  identity: { boardId: string; name: string },
): Promise<BoardDetail> {
  if (!(await exists(boardPath))) {
    throw new NotFoundError(`board not found: ${boardPath}`);
  }
  const lanes = await listLanes(boardPath);
  const contextContent = await readBoardContextContent(boardPath);
  return {
    boardId: identity.boardId,
    name: identity.name,
    path: boardPath,
    available: true,
    lanes,
    contextContent,
  };
}

export async function renameBoard(
  projectRoot: string,
  oldEntry: string,
  newEntry: string,
): Promise<void> {
  const meta = await readProject(projectRoot);
  const idx = meta.config.boards.indexOf(oldEntry);
  if (idx === -1) throw new NotFoundError(`board not registered: ${oldEntry}`);
  const oldAbs = path.isAbsolute(oldEntry) ? oldEntry : path.resolve(projectRoot, oldEntry);
  const newAbs = path.isAbsolute(newEntry) ? newEntry : path.resolve(projectRoot, newEntry);
  if (await exists(newAbs)) throw new ConflictError(`destination exists: ${newAbs}`);
  await mkdir(path.dirname(newAbs), { recursive: true });
  await rename(oldAbs, newAbs);
  meta.config.boards[idx] = newEntry;
  await writeProject(projectRoot, meta.config);
}

export async function deleteBoardFolder(boardPath: string): Promise<void> {
  if (!(await exists(boardPath))) throw new NotFoundError(`board folder not found: ${boardPath}`);
  await rm(boardPath, { recursive: true, force: true });
}
