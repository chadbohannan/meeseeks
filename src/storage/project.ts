import { readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.js';
import { resolveWithin, slugifyBoardPath } from './paths.js';
import type { ProjectConfig, ProjectMeta, BoardSummary, ModelOption } from '../shared/types.js';

// Model aliases resolve to whatever Anthropic currently ships, so a new release
// is picked up by claude-code without editing source. Override per-project by
// adding a `models:` list to project.yaml (e.g. to pin a specific version id).
export const DEFAULT_MODELS: ModelOption[] = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

function parseModels(raw: unknown): ModelOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ModelOption[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object'
      && typeof (entry as ModelOption).value === 'string'
      && typeof (entry as ModelOption).label === 'string') {
      out.push({ value: (entry as ModelOption).value, label: (entry as ModelOption).label });
    }
  }
  return out.length > 0 ? out : undefined;
}

async function readBoardNameFromYaml(boardPath: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(boardPath, 'board.yaml'), 'utf8');
    const parsed = yaml.load(raw) as { name?: string } | null;
    return parsed?.name ?? null;
  } catch {
    return null;
  }
}

const PROJECT_FILE = 'project.yaml';
const PROJECT_FILE_LEGACY = 'project.meeseeks';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function yamlPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_FILE);
}

async function resolveConfigPath(projectRoot: string): Promise<string | null> {
  const p = yamlPath(projectRoot);
  if (await exists(p)) return p;
  const legacy = path.join(projectRoot, PROJECT_FILE_LEGACY);
  if (await exists(legacy)) return legacy;
  return null;
}

function parseConfig(text: string, projectRoot: string): ProjectConfig {
  const parsed = yaml.load(text) as Partial<ProjectConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed project config at ${projectRoot}`);
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(projectRoot),
    boards: Array.isArray(parsed.boards)
      ? parsed.boards.filter((b): b is string => typeof b === 'string')
      : [],
    models: parseModels((parsed as { models?: unknown }).models),
  };
}

export async function readProject(projectRoot: string): Promise<ProjectMeta> {
  const configFile = await resolveConfigPath(projectRoot);
  if (configFile) {
    const text = await readFile(configFile, 'utf8');
    return { path: path.resolve(projectRoot), config: parseConfig(text, projectRoot) };
  }
  // Auto-create project.yaml using directory name
  const config: ProjectConfig = { name: path.basename(projectRoot), boards: [] };
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(yamlPath(projectRoot), text, 'utf8');
  return { path: path.resolve(projectRoot), config };
}

export async function writeProject(projectRoot: string, config: ProjectConfig): Promise<void> {
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(yamlPath(projectRoot), text, 'utf8');
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
    const name = (available ? await readBoardNameFromYaml(abs) : null) ?? path.basename(abs);
    out.push({ boardId: id, name, path: abs, available });
  }
  return out;
}

export async function getModels(projectRoot: string): Promise<ModelOption[]> {
  const meta = await readProject(projectRoot);
  return meta.config.models ?? DEFAULT_MODELS;
}

export async function getBoard(projectRoot: string, boardId: string): Promise<BoardSummary> {
  const boards = await listBoards(projectRoot);
  const board = boards.find(b => b.boardId === boardId);
  if (!board) throw new NotFoundError(`no board with id ${boardId}`);
  return board;
}
