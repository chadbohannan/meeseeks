import { mkdir, rename, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError } from './errors.js';
import { readProject, writeProject } from './project.js';
import { listLanes } from './lane.js';
import type { BoardDetail } from '../shared/types.js';

const DEFAULT_BOARD_YAML = (_name: string) => yaml.dump({
  runtime: {
    harness: 'claude-code',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    args: [],
    env: {},
  },
});

const DEFAULT_CLAUDE_MD = (name: string) => `# ${name}\n\nBoard-level instructions for agents go here.\n`;

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function createBoard(boardPath: string, name: string): Promise<void> {
  if (!name || typeof name !== 'string') throw new InvalidInputError('board name required');
  if (await exists(boardPath)) throw new ConflictError(`board folder already exists: ${boardPath}`);
  await mkdir(path.join(boardPath, 'lanes'), { recursive: true });
  await writeFile(path.join(boardPath, 'CLAUDE.md'), DEFAULT_CLAUDE_MD(name), 'utf8');
  await writeFile(path.join(boardPath, 'board.yaml'), DEFAULT_BOARD_YAML(name), 'utf8');
}

export async function readBoardDetail(boardPath: string): Promise<BoardDetail> {
  if (!(await exists(boardPath))) {
    throw new NotFoundError(`board not found: ${boardPath}`);
  }
  const lanes = await listLanes(boardPath);
  return {
    boardId: path.basename(boardPath),
    name: path.basename(boardPath),
    path: boardPath,
    available: true,
    lanes,
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
