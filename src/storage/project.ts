import { readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { NotFoundError, ConflictError, InvalidInputError } from './errors.js';
import { resolveWithin, slugifyBoardPath } from './paths.js';
import type { ProjectConfig, ProjectMeta, BoardSummary } from '../shared/types.js';

const PROJECT_FILE = 'project.meeseeks';

function configPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_FILE);
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function readProject(projectRoot: string): Promise<ProjectMeta> {
  const p = configPath(projectRoot);
  if (!(await exists(p))) {
    throw new NotFoundError(`no project.meeseeks at ${projectRoot}`);
  }
  const text = await readFile(p, 'utf8');
  const parsed = yaml.load(text) as Partial<ProjectConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed project.meeseeks at ${p}`);
  }
  const config: ProjectConfig = {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(projectRoot),
    boards: Array.isArray(parsed.boards) ? parsed.boards.filter((b): b is string => typeof b === 'string') : [],
  };
  return { path: path.resolve(projectRoot), config };
}

export async function writeProject(projectRoot: string, config: ProjectConfig): Promise<void> {
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(configPath(projectRoot), text, 'utf8');
}

export async function createProject(projectRoot: string, name: string): Promise<ProjectMeta> {
  if (!name || typeof name !== 'string') {
    throw new InvalidInputError('project name required');
  }
  if (await exists(configPath(projectRoot))) {
    throw new ConflictError(`project already exists at ${projectRoot}`);
  }
  const config: ProjectConfig = { name, boards: [] };
  await writeProject(projectRoot, config);
  return { path: path.resolve(projectRoot), config };
}

export async function addBoardToProject(projectRoot: string, boardPath: string): Promise<void> {
  const meta = await readProject(projectRoot);
  if (meta.config.boards.includes(boardPath)) {
    throw new ConflictError(`board already registered: ${boardPath}`);
  }
  meta.config.boards.push(boardPath);
  await writeProject(projectRoot, meta.config);
}

export async function removeBoardFromProject(projectRoot: string, boardPath: string): Promise<void> {
  const meta = await readProject(projectRoot);
  const idx = meta.config.boards.indexOf(boardPath);
  if (idx === -1) throw new NotFoundError(`board not registered: ${boardPath}`);
  meta.config.boards.splice(idx, 1);
  await writeProject(projectRoot, meta.config);
}

export async function listBoards(projectRoot: string): Promise<BoardSummary[]> {
  const meta = await readProject(projectRoot);
  const seen = new Map<string, number>();
  const out: BoardSummary[] = [];
  for (const entry of meta.config.boards) {
    const abs = path.isAbsolute(entry)
      ? entry
      : resolveWithin(projectRoot, entry);
    const baseId = slugifyBoardPath(entry);
    let id = baseId;
    const collisions = seen.get(baseId) ?? 0;
    if (collisions > 0) id = `${baseId}-${collisions}`;
    seen.set(baseId, collisions + 1);

    let available = false;
    try { available = (await stat(abs)).isDirectory(); } catch { available = false; }
    const name = path.basename(abs);
    out.push({ boardId: id, name, path: abs, available });
  }
  return out;
}

/** Look up a board by its derived id; throws NotFoundError if absent. */
export async function getBoard(projectRoot: string, boardId: string): Promise<BoardSummary> {
  const boards = await listBoards(projectRoot);
  const board = boards.find(b => b.boardId === boardId);
  if (!board) throw new NotFoundError(`no board with id ${boardId}`);
  return board;
}
