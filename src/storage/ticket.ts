import { readFile, writeFile, rename, unlink, readdir, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { NotFoundError, InvalidInputError, ConflictError } from './errors.js';
import { buildTicketFilename, appendCollisionSuffix, randomSuffix, resolveWithin } from './paths.js';
import type { TicketSummary, TicketDetail, LaneState } from '../shared/types.js';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function lanePath(boardPath: string, laneName: string): string {
  return resolveWithin(path.join(boardPath, 'lanes'), laneName);
}

async function readStates(lp: string): Promise<LaneState[]> {
  const text = await readFile(path.join(lp, 'lane.yaml'), 'utf8').catch(() => null);
  if (!text) return [];
  const parsed = yaml.load(text) as { states?: LaneState[] } | null;
  return Array.isArray(parsed?.states) ? parsed!.states : [];
}

interface FrontMatter {
  title: string;
  created: string;
  updated: string;
}

export async function findTicketFile(lp: string, filename: string): Promise<{ state: string; abs: string } | null> {
  const entries = await readdir(lp, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(lp, e.name, filename);
    if (await exists(candidate)) return { state: e.name, abs: candidate };
  }
  return null;
}

function parse(content: string): { fm: FrontMatter; body: string } {
  const parsed = matter(content);
  const data = parsed.data as Partial<FrontMatter>;
  if (typeof data.title !== 'string') throw new InvalidInputError('ticket frontmatter missing title');
  return {
    fm: {
      title: data.title,
      created: typeof data.created === 'string' ? data.created : new Date().toISOString(),
      updated: typeof data.updated === 'string' ? data.updated : new Date().toISOString(),
    },
    body: parsed.content,
  };
}

function serialize(fm: FrontMatter, body: string): string {
  return matter.stringify(body, fm);
}

export async function createTicket(
  boardPath: string,
  laneName: string,
  input: { title: string; state: string; body?: string },
): Promise<TicketSummary> {
  if (!input.title) throw new InvalidInputError('title required');
  const lp = lanePath(boardPath, laneName);
  const states = await readStates(lp);
  if (!states.find(s => s.dir === input.state)) {
    throw new InvalidInputError(`unknown state: ${input.state}`);
  }
  let filename = buildTicketFilename(input.title);
  let target = path.join(lp, input.state, filename);
  let attempts = 0;
  while (await exists(target)) {
    if (++attempts > 5) throw new ConflictError('cannot generate unique filename');
    filename = appendCollisionSuffix(buildTicketFilename(input.title), randomSuffix());
    target = path.join(lp, input.state, filename);
  }
  const now = new Date().toISOString();
  const fm: FrontMatter = { title: input.title, created: now, updated: now };
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, serialize(fm, input.body ?? ''), 'utf8');
  return {
    filename,
    state: input.state,
    title: input.title,
    body: input.body ?? '',
    created: now,
    updated: now,
    orphaned: false,
  };
}

export async function listTickets(boardPath: string, laneName: string): Promise<TicketSummary[]> {
  const lp = lanePath(boardPath, laneName);
  const states = await readStates(lp);
  const known = new Set(states.map(s => s.dir));
  const out: TicketSummary[] = [];
  const dirEntries = await readdir(lp, { withFileTypes: true });
  for (const dirEntry of dirEntries) {
    if (!dirEntry.isDirectory()) continue;
    if (dirEntry.name.startsWith('.')) continue;
    const isKnown = known.has(dirEntry.name);
    const dirAbs = path.join(lp, dirEntry.name);
    const files = (await readdir(dirAbs)).filter(f => f.endsWith('.md'));
    for (const f of files) {
      try {
        const text = await readFile(path.join(dirAbs, f), 'utf8');
        const { fm, body } = parse(text);
        out.push({
          filename: f,
          state: isKnown ? dirEntry.name : '__orphaned__',
          title: fm.title,
          body,
          created: fm.created,
          updated: fm.updated,
          orphaned: !isKnown,
        });
      } catch { /* skip unparseable */ }
    }
  }
  return out;
}

export async function readTicket(
  boardPath: string,
  laneName: string,
  filename: string,
): Promise<TicketDetail> {
  const lp = lanePath(boardPath, laneName);
  const found = await findTicketFile(lp, filename);
  if (!found) throw new NotFoundError(`ticket not found: ${filename}`);
  const text = await readFile(found.abs, 'utf8');
  const { fm, body } = parse(text);
  const states = await readStates(lp);
  const known = new Set(states.map(s => s.dir));
  const orphaned = !known.has(found.state);
  return {
    filename,
    state: orphaned ? '__orphaned__' : found.state,
    title: fm.title,
    created: fm.created,
    updated: fm.updated,
    orphaned,
    body,
  };
}

export async function updateTicket(
  boardPath: string,
  laneName: string,
  filename: string,
  patch: { title?: string; body?: string; state?: string },
): Promise<TicketSummary> {
  const lp = lanePath(boardPath, laneName);
  const found = await findTicketFile(lp, filename);
  if (!found) throw new NotFoundError(`ticket not found: ${filename}`);
  const text = await readFile(found.abs, 'utf8');
  const { fm, body } = parse(text);
  const states = await readStates(lp);
  const newState = patch.state ?? found.state;
  if (patch.state !== undefined && !states.find(s => s.dir === patch.state)) {
    throw new InvalidInputError(`unknown state: ${patch.state}`);
  }
  const newFm: FrontMatter = {
    title: patch.title ?? fm.title,
    created: fm.created,
    updated: new Date().toISOString(),
  };
  const newBody = patch.body ?? body;
  const newAbs = path.join(lp, newState, filename);
  if (newAbs !== found.abs) {
    await mkdir(path.dirname(newAbs), { recursive: true });
    if (await exists(newAbs)) throw new ConflictError(`destination exists: ${filename} in ${newState}`);
    await writeFile(found.abs, serialize(newFm, newBody), 'utf8');
    await rename(found.abs, newAbs);
  } else {
    await writeFile(found.abs, serialize(newFm, newBody), 'utf8');
  }
  return {
    filename,
    state: newState,
    title: newFm.title,
    body: newBody,
    created: newFm.created,
    updated: newFm.updated,
    orphaned: false,
  };
}

export async function deleteTicket(
  boardPath: string,
  laneName: string,
  filename: string,
): Promise<void> {
  const lp = lanePath(boardPath, laneName);
  const found = await findTicketFile(lp, filename);
  if (!found) throw new NotFoundError(`ticket not found: ${filename}`);
  await unlink(found.abs);
}
