import { mkdir, readFile, writeFile, readdir, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError, InvalidWorkflowError } from './errors.js';
import { resolveWithin } from './paths.js';
import { workflowProcessTemplate } from './templates.js';
import {
  readWorkspace, listWorkflowEntries, getWorkflowEntry, addWorkflowToWorkspace,
  removeWorkflowFromWorkspace, writeWorkspace, parseRuntime,
} from './workspace.js';
import type {
  WorkflowSummary, WorkflowDetail, WorkflowState, RuntimeConfig,
} from '../shared/types.js';

const WORKFLOW_YAML = 'workflow.yaml';
const PROCESS_MD = 'PROCESS.md';
const PERMISSIONS = 'permissions.yaml';
const WORKFLOWS_DIR = 'workflows';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Resolve a workflow id to its absolute path via the workspace registry. This
 * replaces the old `workflowPath(boardPath, name)` join: a workflow is now
 * wherever its `workflows:` entry points, which need not be under
 * `<workspace>/workflows/`.
 */
export async function resolveWorkflowPath(
  workspaceRoot: string,
  workflowName: string,
): Promise<string> {
  const entry = await getWorkflowEntry(workspaceRoot, workflowName);
  return entry.path;
}

function validateStates(states: WorkflowState[]): void {
  if (!Array.isArray(states) || states.length === 0) {
    throw new InvalidInputError('workflow requires at least one state');
  }
  const seen = new Set<string>();
  for (const s of states) {
    if (!s.dir || !/^[a-z0-9][a-z0-9-]*$/i.test(s.dir)) {
      throw new InvalidInputError(`invalid state dir: ${s.dir}`);
    }
    if (seen.has(s.dir)) throw new InvalidInputError(`duplicate state dir: ${s.dir}`);
    seen.add(s.dir);
    if (!s.name) throw new InvalidInputError(`state name required for ${s.dir}`);
  }
}

function slugifyWorkflowName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function createWorkflow(
  workspaceRoot: string,
  workflowName: string,
  states: WorkflowState[],
  opts: { processDoc?: string; runtime?: RuntimeConfig } = {},
): Promise<string> {
  if (!workflowName || !workflowName.trim()) {
    throw new InvalidInputError('workflow name required');
  }
  const slug = slugifyWorkflowName(workflowName);
  if (!slug) throw new InvalidInputError(`invalid workflow name: ${workflowName}`);
  validateStates(states);

  const entry = `${WORKFLOWS_DIR}/${slug}`;
  const existing = await listWorkflowEntries(workspaceRoot);
  if (existing.some(w => w.workflowName === slug)) {
    throw new ConflictError(`workflow exists: ${slug}`);
  }
  const lp = resolveWithin(workspaceRoot, entry);
  if (await exists(lp)) throw new ConflictError(`workflow directory exists: ${entry}`);

  await mkdir(lp, { recursive: true });
  for (const s of states) await mkdir(path.join(lp, s.dir), { recursive: true });
  const config: Record<string, unknown> = { name: workflowName, states };
  if (opts.runtime) config.runtime = opts.runtime;
  await writeFile(path.join(lp, WORKFLOW_YAML), yaml.dump(config, { lineWidth: -1 }), 'utf8');
  await writeFile(path.join(lp, PROCESS_MD), opts.processDoc ?? workflowProcessTemplate(workflowName, states), 'utf8');
  await writeFile(path.join(lp, PERMISSIONS), yaml.dump({ allowedPaths: [], allowedTools: [], deniedTools: [] }), 'utf8');

  // Registered only after the directory is fully written, so a crash midway
  // leaves an unregistered directory rather than a registry entry pointing at
  // a half-built workflow.
  await addWorkflowToWorkspace(workspaceRoot, entry);
  return slug;
}

async function readWorkflowStates(lp: string): Promise<WorkflowState[]> {
  const yamlPath = path.join(lp, WORKFLOW_YAML);
  if (!(await exists(yamlPath))) {
    throw new InvalidWorkflowError(`missing workflow.yaml at ${lp}`, 'missing workflow.yaml');
  }
  const text = await readFile(yamlPath, 'utf8');
  const parsed = yaml.load(text) as { states?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.states)) {
    throw new InvalidWorkflowError(`malformed workflow.yaml at ${lp}`, 'malformed workflow.yaml');
  }
  const states: WorkflowState[] = [];
  for (const raw of parsed.states) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { dir?: unknown; name?: unknown };
    if (typeof r.dir !== 'string' || typeof r.name !== 'string') continue;
    states.push({ dir: r.dir, name: r.name });
  }
  if (states.length === 0) {
    throw new InvalidWorkflowError(`workflow.yaml has no valid states`, 'no states');
  }
  return states;
}

export async function listWorkflows(workspaceRoot: string): Promise<WorkflowSummary[]> {
  const entries = await listWorkflowEntries(workspaceRoot);
  const summaries: WorkflowSummary[] = [];
  for (const e of entries) {
    // A registered-but-missing workflow is listed as a stub rather than
    // skipped, matching how a malformed workflow.yaml is handled below: the
    // sidebar shows the entry and its problem instead of quietly losing it.
    if (!e.available) {
      summaries.push(stubSummary(e.workflowName, false));
      continue;
    }
    try {
      summaries.push(await readWorkflowSummary(e.path, e.workflowName));
    } catch (err) {
      if (err instanceof InvalidWorkflowError) {
        summaries.push(stubSummary(e.workflowName, true));
      } else {
        throw err;
      }
    }
  }
  return summaries;
}

function stubSummary(workflowName: string, available: boolean): WorkflowSummary {
  return {
    workflowName,
    displayName: workflowName,
    states: [],
    ticketCounts: {},
    orphanedCount: 0,
    available,
  };
}

async function readWorkflowYaml(lp: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path.join(lp, WORKFLOW_YAML), 'utf8');
    return (yaml.load(raw) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function readWorkflowDisplayName(lp: string, fallback: string): Promise<string> {
  try {
    const raw = await readFile(path.join(lp, WORKFLOW_YAML), 'utf8');
    const parsed = yaml.load(raw) as { name?: string } | null;
    return parsed?.name ?? fallback;
  } catch {
    return fallback;
  }
}

async function readWorkflowSummary(lp: string, workflowName: string): Promise<WorkflowSummary> {
  const states = await readWorkflowStates(lp);
  const displayName = await readWorkflowDisplayName(lp, workflowName);
  const ticketCounts: Record<string, number> = {};
  for (const s of states) {
    const sp = path.join(lp, s.dir);
    if (!(await exists(sp))) {
      await mkdir(sp, { recursive: true });  // auto-create
    }
    const files = await readdir(sp);
    ticketCounts[s.dir] = files.filter(f => f.endsWith('.md')).length;
  }
  // Detect orphans: .md files in subfolders not listed in states
  const known = new Set(states.map(s => s.dir));
  let orphanedCount = 0;
  const all = await readdir(lp, { withFileTypes: true });
  for (const e of all) {
    if (!e.isDirectory() || known.has(e.name)) continue;
    if (e.name === '.' || e.name === '..') continue;
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const files = await readdir(path.join(lp, e.name));
    orphanedCount += files.filter(f => f.endsWith('.md')).length;
  }
  return { workflowName, displayName, states, ticketCounts, orphanedCount, available: true };
}

/**
 * Resolve the runtime an agent should be spawned with. The workflow's block
 * wins whole; the workspace default is used only when the workflow defines
 * none. Resolution is deliberately not per-field — merging would let a
 * workflow pin `model` while silently inheriting an `env` it never declared,
 * leaving spawn behavior unreadable from either file alone.
 */
export async function resolveWorkflowRuntime(
  workspaceRoot: string,
  workflowName: string,
): Promise<{ runtime: RuntimeConfig | null; inherited: boolean }> {
  const lp = await resolveWorkflowPath(workspaceRoot, workflowName);
  const own = parseRuntime((await readWorkflowYaml(lp)).runtime);
  if (own) return { runtime: own, inherited: false };
  const meta = await readWorkspace(workspaceRoot);
  return { runtime: meta.config.runtime ?? null, inherited: meta.config.runtime !== undefined };
}

export async function readWorkflowDetail(
  workspaceRoot: string,
  workflowName: string,
): Promise<WorkflowDetail> {
  const lp = await resolveWorkflowPath(workspaceRoot, workflowName);
  if (!(await exists(lp))) throw new NotFoundError(`workflow not found: ${workflowName}`);
  const summary = await readWorkflowSummary(lp, workflowName);
  const processDocPath = path.join(lp, PROCESS_MD);
  const hasProcessDoc = await exists(processDocPath);
  const processDoc = hasProcessDoc
    ? await readFile(processDocPath, 'utf8')
    : null;
  const { runtime, inherited } = await resolveWorkflowRuntime(workspaceRoot, workflowName);
  return {
    ...summary,
    hasProcessDoc,
    hasPermissions: await exists(path.join(lp, PERMISSIONS)),
    processDoc,
    runtime,
    runtimeInherited: inherited,
  };
}

export async function writeProcessDoc(
  workspaceRoot: string,
  workflowName: string,
  content: string,
): Promise<void> {
  const lp = await resolveWorkflowPath(workspaceRoot, workflowName);
  if (!(await exists(lp))) throw new NotFoundError(`workflow not found: ${workflowName}`);
  await writeFile(path.join(lp, PROCESS_MD), content, 'utf8');
}

/** Write (or clear, with null) this workflow's own `runtime:` block. */
export async function writeWorkflowRuntime(
  workspaceRoot: string,
  workflowName: string,
  runtime: RuntimeConfig | null,
): Promise<void> {
  const lp = await resolveWorkflowPath(workspaceRoot, workflowName);
  if (!(await exists(lp))) throw new NotFoundError(`workflow not found: ${workflowName}`);
  const existing = await readWorkflowYaml(lp);
  if (runtime) existing.runtime = runtime;
  else delete existing.runtime;
  await writeFile(path.join(lp, WORKFLOW_YAML), yaml.dump(existing, { lineWidth: -1 }), 'utf8');
}

export async function updateWorkflowStates(
  workspaceRoot: string,
  workflowName: string,
  newStates: WorkflowState[],
  opts: { force?: boolean } = {},
): Promise<void> {
  validateStates(newStates);
  const lp = await resolveWorkflowPath(workspaceRoot, workflowName);
  const oldStates = await readWorkflowStates(lp);
  const newDirs = new Set(newStates.map(s => s.dir));
  for (const s of oldStates) {
    if (newDirs.has(s.dir)) continue;
    const sp = path.join(lp, s.dir);
    const files = (await readdir(sp).catch(() => [])).filter(f => f.endsWith('.md'));
    if (files.length > 0 && !opts.force) {
      throw new ConflictError(`state ${s.dir} contains tickets; remove them or pass force=true`);
    }
  }
  for (const s of newStates) {
    await mkdir(path.join(lp, s.dir), { recursive: true });
  }
  const existing = await readWorkflowYaml(lp);
  await writeFile(
    path.join(lp, WORKFLOW_YAML),
    yaml.dump({ ...existing, states: newStates }, { lineWidth: -1 }),
    'utf8',
  );
  // Removed-state folders are NOT deleted from disk in this slice; tickets become orphaned.
}

export async function renameWorkflow(
  workspaceRoot: string,
  oldSlug: string,
  newDisplayName: string,
): Promise<string> {
  if (!newDisplayName || !newDisplayName.trim()) {
    throw new InvalidInputError('workflow name required');
  }
  const newSlug = slugifyWorkflowName(newDisplayName);
  if (!newSlug) throw new InvalidInputError(`invalid workflow name: ${newDisplayName}`);
  const entry = await getWorkflowEntry(workspaceRoot, oldSlug);
  if (!(await exists(entry.path))) throw new NotFoundError(`workflow not found: ${oldSlug}`);

  let lp = entry.path;
  if (newSlug !== oldSlug) {
    const taken = await listWorkflowEntries(workspaceRoot);
    if (taken.some(w => w.workflowName === newSlug)) {
      throw new ConflictError(`workflow exists: ${newSlug}`);
    }
    // The id is the entry's basename, so renaming the id means moving the
    // directory and rewriting the registry entry that points at it. Both must
    // happen or the registry dangles.
    const newPath = path.join(path.dirname(entry.path), newSlug);
    if (await exists(newPath)) throw new ConflictError(`workflow directory exists: ${newSlug}`);
    await rename(entry.path, newPath);
    lp = newPath;

    const meta = await readWorkspace(workspaceRoot);
    const idx = meta.config.workflows.findIndex(
      e => path.resolve(workspaceRoot, e) === path.resolve(entry.path),
    );
    const old = meta.config.workflows[idx];
    if (idx !== -1 && old !== undefined) {
      meta.config.workflows[idx] = path.isAbsolute(old)
        ? newPath
        : path.join(path.dirname(old), newSlug);
      await writeWorkspace(workspaceRoot, meta.config);
    }
  }

  const existing = await readWorkflowYaml(lp);
  existing.name = newDisplayName;
  await writeFile(path.join(lp, WORKFLOW_YAML), yaml.dump(existing, { lineWidth: -1 }), 'utf8');
  return newSlug;
}

export async function deleteWorkflowFolder(
  workspaceRoot: string,
  workflowName: string,
): Promise<void> {
  const entry = await getWorkflowEntry(workspaceRoot, workflowName);
  const registryEntry = (await readWorkspace(workspaceRoot)).config.workflows.find(
    e => path.resolve(workspaceRoot, e) === path.resolve(entry.path),
  );
  await rm(entry.path, { recursive: true, force: true });
  // Deregistered even when the directory was already gone, so deleting a
  // registered-but-missing workflow clears the stub rather than failing.
  if (registryEntry) await removeWorkflowFromWorkspace(workspaceRoot, registryEntry);
}
