import { readFile, writeFile, mkdir, rm, stat, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.js';
import { expandHome, resolveWithin, slugifyProjectPath, buildProjectFilename } from './paths.js';
import { readWorkspace, addProjectToWorkspace, removeProjectFromWorkspace } from './workspace.js';
import { starterPermissions } from './templates.js';
import type {
  ProjectConfig, ProjectSummary, ProjectDetail, PermissionsConfig,
} from '../shared/types.js';

export const PROJECTS_DIR = 'projects';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/**
 * A project's `root` deliberately points outside the workspace — that is the
 * whole point of the type — so it must not go through `resolveWithin`. It gets
 * its own validation instead: expand `~`, resolve to absolute, reject empty.
 */
function resolveProjectRoot(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InvalidInputError('project root required');
  }
  return path.resolve(expandHome(raw.trim()));
}

function parsePermissions(raw: unknown): PermissionsConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<PermissionsConfig>;
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const out: PermissionsConfig = {
    allowedPaths: list(r.allowedPaths),
    allowedTools: list(r.allowedTools),
    deniedTools: list(r.deniedTools),
  };
  const empty = out.allowedPaths.length === 0
    && out.allowedTools.length === 0
    && out.deniedTools.length === 0;
  return empty ? undefined : out;
}

function parseConfig(text: string, configPath: string): ProjectConfig {
  const parsed = yaml.load(text) as Partial<ProjectConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed project config at ${configPath}`);
  }
  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() !== ''
      ? parsed.name
      : slugifyProjectPath(configPath),
    root: resolveProjectRoot(parsed.root),
    color: typeof parsed.color === 'string' ? parsed.color : undefined,
    context: typeof parsed.context === 'string' ? parsed.context : undefined,
    contextFile: typeof parsed.contextFile === 'string' ? parsed.contextFile : undefined,
    permissions: parsePermissions(parsed.permissions),
  };
}

function serialize(config: ProjectConfig): string {
  const out: Record<string, unknown> = { name: config.name, root: config.root };
  if (config.color !== undefined) out.color = config.color;
  if (config.context !== undefined) out.context = config.context;
  if (config.contextFile !== undefined) out.contextFile = config.contextFile;
  if (config.permissions !== undefined) out.permissions = config.permissions;
  // lineWidth -1 disables folding. Project configs are meant to be hand-edited,
  // and a long `root` would otherwise be wrapped into a `>-` block scalar.
  return yaml.dump(out, { lineWidth: -1 });
}

async function isDirectory(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/** Resolve a workspace config entry (e.g. 'projects/meeseeks.yaml') to an absolute path. */
function entryToAbs(workspaceRoot: string, entry: string): string {
  return path.isAbsolute(entry) ? entry : resolveWithin(workspaceRoot, entry);
}

interface ResolvedEntry { projectId: string; entry: string; abs: string }

/**
 * Map workspace `projects:` entries to ids, applying the same collision
 * suffixing `listBoards` uses so two configs with the same basename stay
 * addressable.
 */
async function resolveEntries(workspaceRoot: string): Promise<ResolvedEntry[]> {
  const meta = await readWorkspace(workspaceRoot);
  const seen = new Map<string, number>();
  const out: ResolvedEntry[] = [];
  for (const entry of meta.config.projects) {
    const baseId = slugifyProjectPath(entry);
    if (!baseId) continue;
    const collisions = seen.get(baseId) ?? 0;
    seen.set(baseId, collisions + 1);
    const projectId = collisions > 0 ? `${baseId}-${collisions}` : baseId;
    out.push({ projectId, entry, abs: entryToAbs(workspaceRoot, entry) });
  }
  return out;
}

async function readConfigAt(abs: string): Promise<ProjectConfig | null> {
  try {
    return parseConfig(await readFile(abs, 'utf8'), abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function toSummary(projectId: string, config: ProjectConfig, available: boolean): ProjectSummary {
  return { projectId, name: config.name, root: config.root, color: config.color, available };
}

export async function listProjects(workspaceRoot: string): Promise<ProjectSummary[]> {
  const entries = await resolveEntries(workspaceRoot);
  const out: ProjectSummary[] = [];
  for (const { projectId, abs } of entries) {
    const config = await readConfigAt(abs).catch(() => null);
    // A registered entry whose config file is missing or malformed is surfaced
    // as unavailable rather than dropped, so the misconfiguration is visible.
    if (!config) {
      out.push({ projectId, name: projectId, root: '', available: false });
      continue;
    }
    out.push(toSummary(projectId, config, await isDirectory(config.root)));
  }
  return out;
}

async function resolveContext(config: ProjectConfig, configPath: string): Promise<string | null> {
  if (config.context !== undefined) return config.context;
  if (config.contextFile) {
    const abs = resolveWithin(path.dirname(configPath), config.contextFile);
    return await readFile(abs, 'utf8').catch(() => null);
  }
  return null;
}

export async function getProject(workspaceRoot: string, projectId: string): Promise<ProjectDetail> {
  const entries = await resolveEntries(workspaceRoot);
  const found = entries.find(e => e.projectId === projectId);
  if (!found) throw new NotFoundError(`no project with id ${projectId}`);
  const config = await readConfigAt(found.abs);
  if (!config) throw new NotFoundError(`project config missing: ${found.entry}`);
  return {
    ...toSummary(projectId, config, await isDirectory(config.root)),
    configPath: found.abs,
    contextContent: await resolveContext(config, found.abs),
    permissions: config.permissions ?? null,
  };
}

export interface CreateProjectInput {
  name: string;
  root: string;
  color?: string;
  context?: string;
  permissions?: PermissionsConfig;
}

export async function createProject(
  workspaceRoot: string,
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  if (!input?.name || input.name.trim() === '') {
    throw new InvalidInputError('project name required');
  }
  const root = resolveProjectRoot(input.root);
  const filename = buildProjectFilename(input.name);
  const entry = `${PROJECTS_DIR}/${filename}`;
  const abs = resolveWithin(workspaceRoot, entry);
  if (await exists(abs)) throw new ConflictError(`project config already exists: ${entry}`);

  // A project created without permissions gets the starter set rather than
  // none. It grants only read access to the root the caller just registered —
  // implied by the act of registering it — and a caller that supplies its own
  // permissions (including empty ones) overrides it entirely.
  const config: ProjectConfig = {
    name: input.name.trim(),
    root,
    color: input.color,
    context: input.context,
    permissions: input.permissions ?? starterPermissions(root),
  };
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, serialize(config), 'utf8');
  await addProjectToWorkspace(workspaceRoot, entry);
  return toSummary(slugifyProjectPath(entry), config, await isDirectory(root));
}

export interface PatchProjectInput {
  name?: string;
  root?: string;
  color?: string;
  context?: string;
  permissions?: PermissionsConfig;
}

/**
 * Patches the config in place. The config filename — and therefore the
 * projectId — deliberately does not follow a rename: tickets reference the id,
 * so changing it would orphan every ticket bound to this project.
 */
export async function updateProject(
  workspaceRoot: string,
  projectId: string,
  patch: PatchProjectInput,
): Promise<ProjectDetail> {
  const entries = await resolveEntries(workspaceRoot);
  const found = entries.find(e => e.projectId === projectId);
  if (!found) throw new NotFoundError(`no project with id ${projectId}`);
  const config = await readConfigAt(found.abs);
  if (!config) throw new NotFoundError(`project config missing: ${found.entry}`);

  if (patch.name !== undefined) {
    if (patch.name.trim() === '') throw new InvalidInputError('project name cannot be empty');
    config.name = patch.name.trim();
  }
  if (patch.root !== undefined) config.root = resolveProjectRoot(patch.root);
  if (patch.color !== undefined) config.color = patch.color;
  if (patch.context !== undefined) config.context = patch.context;
  if (patch.permissions !== undefined) config.permissions = patch.permissions;

  await writeFile(found.abs, serialize(config), 'utf8');
  return {
    ...toSummary(projectId, config, await isDirectory(config.root)),
    configPath: found.abs,
    contextContent: await resolveContext(config, found.abs),
    permissions: config.permissions ?? null,
  };
}

/**
 * Unregisters the project and deletes its config file. Tickets naming this
 * project are left untouched — their `project` key becomes a dangling
 * reference, which the UI surfaces as an unknown-project badge. Rewriting
 * ticket files across every board during a delete would be a worse failure
 * mode than a visible dangling reference.
 */
export async function deleteProject(workspaceRoot: string, projectId: string): Promise<void> {
  const entries = await resolveEntries(workspaceRoot);
  const found = entries.find(e => e.projectId === projectId);
  if (!found) throw new NotFoundError(`no project with id ${projectId}`);
  await removeProjectFromWorkspace(workspaceRoot, found.entry);
  await rm(found.abs, { force: true });
}
