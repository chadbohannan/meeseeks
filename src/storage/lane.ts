import { mkdir, readFile, writeFile, readdir, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError, InvalidLaneError } from './errors.js';
import { resolveWithin } from './paths.js';
import type { LaneSummary, LaneDetail, LaneState } from '../shared/types.js';

const LANE_YAML = 'lane.yaml';
const PROCESS_MD = 'PROCESS.md';
const PERMISSIONS = 'permissions.yaml';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function lanesDir(boardPath: string): string {
  return path.join(boardPath, 'lanes');
}

function lanePath(boardPath: string, laneName: string): string {
  return resolveWithin(lanesDir(boardPath), laneName);
}

function validateStates(states: LaneState[]): void {
  if (!Array.isArray(states) || states.length === 0) {
    throw new InvalidInputError('lane requires at least one state');
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

export async function createLane(boardPath: string, laneName: string, states: LaneState[]): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(laneName)) {
    throw new InvalidInputError(`invalid lane name: ${laneName}`);
  }
  validateStates(states);
  const lp = lanePath(boardPath, laneName);
  if (await exists(lp)) throw new ConflictError(`lane exists: ${laneName}`);
  await mkdir(lp, { recursive: true });
  for (const s of states) await mkdir(path.join(lp, s.dir), { recursive: true });
  await writeFile(path.join(lp, LANE_YAML), yaml.dump({ states }), 'utf8');
  await writeFile(path.join(lp, PROCESS_MD), `# Process for ${laneName}\n\nDescribe stages and transition rules here.\n`, 'utf8');
  await writeFile(path.join(lp, PERMISSIONS), yaml.dump({ allowedPaths: [], allowedTools: [], deniedTools: [] }), 'utf8');
}

async function readLaneStates(lp: string): Promise<LaneState[]> {
  const yamlPath = path.join(lp, LANE_YAML);
  if (!(await exists(yamlPath))) {
    throw new InvalidLaneError(`missing lane.yaml at ${lp}`, 'missing lane.yaml');
  }
  const text = await readFile(yamlPath, 'utf8');
  const parsed = yaml.load(text) as { states?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.states)) {
    throw new InvalidLaneError(`malformed lane.yaml at ${lp}`, 'malformed lane.yaml');
  }
  const states: LaneState[] = [];
  for (const raw of parsed.states) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { dir?: unknown; name?: unknown };
    if (typeof r.dir !== 'string' || typeof r.name !== 'string') continue;
    states.push({ dir: r.dir, name: r.name });
  }
  if (states.length === 0) {
    throw new InvalidLaneError(`lane.yaml has no valid states`, 'no states');
  }
  return states;
}

export async function listLanes(boardPath: string): Promise<LaneSummary[]> {
  const dir = lanesDir(boardPath);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const summaries: LaneSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const detail = await readLaneSummary(boardPath, e.name);
      summaries.push(detail);
    } catch (err) {
      if (err instanceof InvalidLaneError) {
        summaries.push({
          laneName: e.name,
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

async function readLaneSummary(boardPath: string, laneName: string): Promise<LaneSummary> {
  const lp = lanePath(boardPath, laneName);
  const states = await readLaneStates(lp);
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
  return { laneName, states, ticketCounts, orphanedCount };
}

export async function readLaneDetail(boardPath: string, laneName: string): Promise<LaneDetail> {
  const lp = lanePath(boardPath, laneName);
  if (!(await exists(lp))) throw new NotFoundError(`lane not found: ${laneName}`);
  const summary = await readLaneSummary(boardPath, laneName);
  return {
    ...summary,
    hasProcessDoc: await exists(path.join(lp, PROCESS_MD)),
    hasPermissions: await exists(path.join(lp, PERMISSIONS)),
  };
}

export async function updateLaneStates(
  boardPath: string,
  laneName: string,
  newStates: LaneState[],
  opts: { force?: boolean } = {},
): Promise<void> {
  validateStates(newStates);
  const lp = lanePath(boardPath, laneName);
  const oldStates = await readLaneStates(lp);
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
  await writeFile(path.join(lp, LANE_YAML), yaml.dump({ states: newStates }), 'utf8');
  // Removed-state folders are NOT deleted from disk in this slice; tickets become orphaned.
}

export async function renameLane(boardPath: string, oldName: string, newName: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(newName)) {
    throw new InvalidInputError(`invalid lane name: ${newName}`);
  }
  const oldPath = lanePath(boardPath, oldName);
  const newPath = lanePath(boardPath, newName);
  if (!(await exists(oldPath))) throw new NotFoundError(`lane not found: ${oldName}`);
  if (await exists(newPath)) throw new ConflictError(`lane exists: ${newName}`);
  await rename(oldPath, newPath);
}

export async function deleteLaneFolder(boardPath: string, laneName: string): Promise<void> {
  const lp = lanePath(boardPath, laneName);
  if (!(await exists(lp))) throw new NotFoundError(`lane not found: ${laneName}`);
  await rm(lp, { recursive: true, force: true });
}
