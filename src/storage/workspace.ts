import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { exists, dumpYaml } from './io.js';
import yaml from 'js-yaml';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.js';
import { resolveWithin, slugifyWorkflowPath } from './paths.js';
import type {
  WorkspaceConfig, WorkspaceMeta, WorkflowEntry, ModelOption, RuntimeConfig,
} from '../shared/types.js';

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

/**
 * Parse a `runtime:` block. Returns undefined rather than a partial object when
 * required fields are missing — a half-populated runtime would spawn an agent
 * with a silently wrong model or harness.
 */
export function parseRuntime(raw: unknown): RuntimeConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<RuntimeConfig>;
  if (typeof r.harness !== 'string' || typeof r.provider !== 'string' || typeof r.model !== 'string') {
    return undefined;
  }
  return {
    harness: r.harness,
    provider: r.provider,
    model: r.model,
    args: Array.isArray(r.args) ? r.args.filter((a): a is string => typeof a === 'string') : [],
    env: r.env && typeof r.env === 'object'
      ? Object.fromEntries(
          Object.entries(r.env).filter(([, v]) => typeof v === 'string') as [string, string][],
        )
      : {},
  };
}

const WORKSPACE_FILE = 'workspace.yaml';

function yamlPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, WORKSPACE_FILE);
}

function parseConfig(text: string, workspaceRoot: string): WorkspaceConfig {
  const parsed = yaml.load(text) as Partial<WorkspaceConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed workspace config at ${workspaceRoot}`);
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(workspaceRoot),
    workflows: Array.isArray(parsed.workflows)
      ? parsed.workflows.filter((w): w is string => typeof w === 'string')
      : [],
    projects: Array.isArray(parsed.projects)
      ? parsed.projects.filter((p): p is string => typeof p === 'string')
      : [],
    models: parseModels((parsed as { models?: unknown }).models),
    runtime: parseRuntime((parsed as { runtime?: unknown }).runtime),
  };
}

/**
 * Read the workspace config. Pure: a workspace that does not exist yet is a
 * `NotFoundError`, not something to conjure — creation and seeding belong to
 * `openWorkspace` in `open.ts`, which the server calls once at startup.
 *
 * There is deliberately no fallback to the old `project.yaml`. Reading one
 * would surface a config whose `boards:` key this code no longer understands,
 * presenting an empty workspace as if it were a valid one; the migration in
 * `migrate.ts` is what turns that file into a workspace.
 */
export async function readWorkspace(workspaceRoot: string): Promise<WorkspaceMeta> {
  const configFile = yamlPath(workspaceRoot);
  if (!(await exists(configFile))) {
    throw new NotFoundError(`no workspace at ${workspaceRoot}`);
  }
  const text = await readFile(configFile, 'utf8');
  return { path: path.resolve(workspaceRoot), config: parseConfig(text, workspaceRoot) };
}

export async function writeWorkspace(workspaceRoot: string, config: WorkspaceConfig): Promise<void> {
  // lineWidth: -1 disables folding. Entries here are paths, and a folded path
  // round-trips as a `>-` block scalar that is unpleasant to hand-edit.
  const text = dumpYaml(config);
  await writeFile(yamlPath(workspaceRoot), text, 'utf8');
}

export async function addWorkflowToWorkspace(workspaceRoot: string, entry: string): Promise<void> {
  const meta = await readWorkspace(workspaceRoot);
  if (meta.config.workflows.includes(entry)) {
    throw new ConflictError(`workflow already registered: ${entry}`);
  }
  meta.config.workflows.push(entry);
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

export async function removeWorkflowFromWorkspace(workspaceRoot: string, entry: string): Promise<void> {
  const meta = await readWorkspace(workspaceRoot);
  const idx = meta.config.workflows.indexOf(entry);
  if (idx === -1) throw new NotFoundError(`workflow not registered: ${entry}`);
  meta.config.workflows.splice(idx, 1);
  await writeWorkspace(workspaceRoot, meta.config);
}

/**
 * Resolve the `workflows:` registry to absolute paths. Registration and
 * presence on disk are deliberately separate: an entry whose directory is
 * missing is reported with `available: false` rather than dropped, so a
 * mistyped or half-deleted workflow is visible instead of silently absent.
 */
export async function listWorkflowEntries(workspaceRoot: string): Promise<WorkflowEntry[]> {
  const meta = await readWorkspace(workspaceRoot);
  const seen = new Map<string, number>();
  const out: WorkflowEntry[] = [];
  for (const entry of meta.config.workflows) {
    const abs = path.isAbsolute(entry)
      ? entry
      : resolveWithin(workspaceRoot, entry);
    const baseId = slugifyWorkflowPath(entry);
    let id = baseId;
    const collisions = seen.get(baseId) ?? 0;
    if (collisions > 0) id = `${baseId}-${collisions}`;
    seen.set(baseId, collisions + 1);

    let available = false;
    try { available = (await stat(abs)).isDirectory(); } catch { available = false; }
    out.push({ workflowName: id, path: abs, available });
  }
  return out;
}

export async function getWorkflowEntry(
  workspaceRoot: string,
  workflowName: string,
): Promise<WorkflowEntry> {
  const entries = await listWorkflowEntries(workspaceRoot);
  const found = entries.find(w => w.workflowName === workflowName);
  if (!found) throw new NotFoundError(`no workflow with id ${workflowName}`);
  return found;
}

export async function getModels(workspaceRoot: string): Promise<ModelOption[]> {
  const meta = await readWorkspace(workspaceRoot);
  return meta.config.models ?? DEFAULT_MODELS;
}
