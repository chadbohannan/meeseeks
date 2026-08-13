import { readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.js';
import { resolveWithin, slugifyBoardPath } from './paths.js';
import type { WorkspaceConfig, WorkspaceMeta, BoardSummary, ModelOption } from '../shared/types.js';

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

function yamlPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, PROJECT_FILE);
}

async function resolveConfigPath(workspaceRoot: string): Promise<string | null> {
  const p = yamlPath(workspaceRoot);
  if (await exists(p)) return p;
  const legacy = path.join(workspaceRoot, PROJECT_FILE_LEGACY);
  if (await exists(legacy)) return legacy;
  return null;
}

function parseConfig(text: string, workspaceRoot: string): WorkspaceConfig {
  const parsed = yaml.load(text) as Partial<WorkspaceConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed project config at ${workspaceRoot}`);
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(workspaceRoot),
    boards: Array.isArray(parsed.boards)
      ? parsed.boards.filter((b): b is string => typeof b === 'string')
      : [],
    projects: Array.isArray(parsed.projects)
      ? parsed.projects.filter((p): p is string => typeof p === 'string')
      : [],
    models: parseModels((parsed as { models?: unknown }).models),
  };
}

export async function readWorkspace(workspaceRoot: string): Promise<WorkspaceMeta> {
  const configFile = await resolveConfigPath(workspaceRoot);
  if (configFile) {
    const text = await readFile(configFile, 'utf8');
    return { path: path.resolve(workspaceRoot), config: parseConfig(text, workspaceRoot) };
  }
  // Auto-create project.yaml using directory name
  const config: WorkspaceConfig = { name: path.basename(workspaceRoot), boards: [], projects: [] };
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(yamlPath(workspaceRoot), text, 'utf8');
  return { path: path.resolve(workspaceRoot), config };
}

export async function writeWorkspace(workspaceRoot: string, config: WorkspaceConfig): Promise<void> {
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(yamlPath(workspaceRoot), text, 'utf8');
}

export async function addBoardToWorkspace(workspaceRoot: string, boardPath: string): Promise<void> {
  const meta = await readWorkspace(workspaceRoot);
  if (meta.config.boards.includes(boardPath)) {
    throw new ConflictError(`board already registered: ${boardPath}`);
  }
  meta.config.boards.push(boardPath);
  await writeWorkspace(workspaceRoot, meta.config);
}

export async function addProjectToWorkspace(workspaceRoot: string, entry: string): Promise<void> {
  const meta = await readWorkspace(workspaceRoot);
  if (meta.config.projects.includes(entry)) {
    throw new ConflictError(`project already registered: ${entry}`);
  }
  meta.config.projects.push(entry);
  await writeWorkspace(workspaceRoot, meta.config);
}

export async function removeProjectFromWorkspace(workspaceRoot: string, entry: string): Promise<void> {
  const meta = await readWorkspace(workspaceRoot);
  const idx = meta.config.projects.indexOf(entry);
  if (idx === -1) throw new NotFoundError(`project not registered: ${entry}`);
  meta.config.projects.splice(idx, 1);
  await writeWorkspace(workspaceRoot, meta.config);
}

export async function removeBoardFromWorkspace(workspaceRoot: string, boardPath: string): Promise<void> {
  const meta = await readWorkspace(workspaceRoot);
  const idx = meta.config.boards.indexOf(boardPath);
  if (idx === -1) throw new NotFoundError(`board not registered: ${boardPath}`);
  meta.config.boards.splice(idx, 1);
  await writeWorkspace(workspaceRoot, meta.config);
}

export async function listBoards(workspaceRoot: string): Promise<BoardSummary[]> {
  const meta = await readWorkspace(workspaceRoot);
  const seen = new Map<string, number>();
  const out: BoardSummary[] = [];
  for (const entry of meta.config.boards) {
    const abs = path.isAbsolute(entry)
      ? entry
      : resolveWithin(workspaceRoot, entry);
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

export async function getModels(workspaceRoot: string): Promise<ModelOption[]> {
  const meta = await readWorkspace(workspaceRoot);
  return meta.config.models ?? DEFAULT_MODELS;
}

export async function getBoard(workspaceRoot: string, boardId: string): Promise<BoardSummary> {
  const boards = await listBoards(workspaceRoot);
  const board = boards.find(b => b.boardId === boardId);
  if (!board) throw new NotFoundError(`no board with id ${boardId}`);
  return board;
}
