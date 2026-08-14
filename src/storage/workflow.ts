import { mkdir, readFile, writeFile, readdir, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError, InvalidWorkflowError } from './errors.js';
import { resolveWithin } from './paths.js';
import { workflowProcessTemplate } from './templates.js';
import type { WorkflowSummary, WorkflowDetail, WorkflowState } from '../shared/types.js';

const WORKFLOW_YAML = 'workflow.yaml';
const PROCESS_MD = 'PROCESS.md';
const PERMISSIONS = 'permissions.yaml';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function workflowsDir(boardPath: string): string {
  return path.join(boardPath, 'workflows');
}

function workflowPath(boardPath: string, workflowName: string): string {
  return resolveWithin(workflowsDir(boardPath), workflowName);
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
  boardPath: string,
  workflowName: string,
  states: WorkflowState[],
  opts: { processDoc?: string } = {},
): Promise<string> {
  if (!workflowName || !workflowName.trim()) {
    throw new InvalidInputError('workflow name required');
  }
  const slug = slugifyWorkflowName(workflowName);
  if (!slug) throw new InvalidInputError(`invalid workflow name: ${workflowName}`);
  validateStates(states);
  const lp = workflowPath(boardPath, slug);
  if (await exists(lp)) throw new ConflictError(`workflow exists: ${slug}`);
  await mkdir(lp, { recursive: true });
  for (const s of states) await mkdir(path.join(lp, s.dir), { recursive: true });
  await writeFile(path.join(lp, WORKFLOW_YAML), yaml.dump({ name: workflowName, states }), 'utf8');
  await writeFile(path.join(lp, PROCESS_MD), opts.processDoc ?? workflowProcessTemplate(workflowName, states), 'utf8');
  await writeFile(path.join(lp, PERMISSIONS), yaml.dump({ allowedPaths: [], allowedTools: [], deniedTools: [] }), 'utf8');
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

export async function listWorkflows(boardPath: string): Promise<WorkflowSummary[]> {
  const dir = workflowsDir(boardPath);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const summaries: WorkflowSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const detail = await readWorkflowSummary(boardPath, e.name);
      summaries.push(detail);
    } catch (err) {
      if (err instanceof InvalidWorkflowError) {
        summaries.push({
          workflowName: e.name,
          displayName: e.name,
          states: [],
          ticketCounts: {},
          orphanedCount: 0,
        });
      } else {
        throw err;
      }
    }
  }
  return summaries;
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

async function readWorkflowSummary(boardPath: string, workflowName: string): Promise<WorkflowSummary> {
  const lp = workflowPath(boardPath, workflowName);
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
  return { workflowName, displayName, states, ticketCounts, orphanedCount };
}

export async function readWorkflowDetail(boardPath: string, workflowName: string): Promise<WorkflowDetail> {
  const lp = workflowPath(boardPath, workflowName);
  if (!(await exists(lp))) throw new NotFoundError(`workflow not found: ${workflowName}`);
  const summary = await readWorkflowSummary(boardPath, workflowName);
  const processDocPath = path.join(lp, PROCESS_MD);
  const hasProcessDoc = await exists(processDocPath);
  const processDoc = hasProcessDoc
    ? await readFile(processDocPath, 'utf8')
    : null;
  return {
    ...summary,
    hasProcessDoc,
    hasPermissions: await exists(path.join(lp, PERMISSIONS)),
    processDoc,
  };
}

export async function writeProcessDoc(boardPath: string, workflowName: string, content: string): Promise<void> {
  const lp = workflowPath(boardPath, workflowName);
  if (!(await exists(lp))) throw new NotFoundError(`workflow not found: ${workflowName}`);
  await writeFile(path.join(lp, PROCESS_MD), content, 'utf8');
}

export async function updateWorkflowStates(
  boardPath: string,
  workflowName: string,
  newStates: WorkflowState[],
  opts: { force?: boolean } = {},
): Promise<void> {
  validateStates(newStates);
  const lp = workflowPath(boardPath, workflowName);
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
  await writeFile(path.join(lp, WORKFLOW_YAML), yaml.dump({ ...existing, states: newStates }), 'utf8');
  // Removed-state folders are NOT deleted from disk in this slice; tickets become orphaned.
}

export async function renameWorkflow(boardPath: string, oldSlug: string, newDisplayName: string): Promise<string> {
  if (!newDisplayName || !newDisplayName.trim()) {
    throw new InvalidInputError('workflow name required');
  }
  const newSlug = slugifyWorkflowName(newDisplayName);
  if (!newSlug) throw new InvalidInputError(`invalid workflow name: ${newDisplayName}`);
  const oldPath = workflowPath(boardPath, oldSlug);
  if (!(await exists(oldPath))) throw new NotFoundError(`workflow not found: ${oldSlug}`);
  if (newSlug !== oldSlug) {
    const newPath = workflowPath(boardPath, newSlug);
    if (await exists(newPath)) throw new ConflictError(`workflow exists: ${newSlug}`);
    await rename(oldPath, newPath);
  }
  const lp = workflowPath(boardPath, newSlug);
  const existing = await readWorkflowYaml(lp);
  existing.name = newDisplayName;
  await writeFile(path.join(lp, WORKFLOW_YAML), yaml.dump(existing), 'utf8');
  return newSlug;
}

export async function deleteWorkflowFolder(boardPath: string, workflowName: string): Promise<void> {
  const lp = workflowPath(boardPath, workflowName);
  if (!(await exists(lp))) throw new NotFoundError(`workflow not found: ${workflowName}`);
  await rm(lp, { recursive: true, force: true });
}
