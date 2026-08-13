import path from 'node:path';
import os from 'node:os';
import { PathSafetyError } from './errors.js';

/** Expand a leading `~` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Resolve `child` against `root` and guarantee the result stays inside `root`. */
export function resolveWithin(root: string, child: string): string {
  const absRoot = path.resolve(root);
  const resolved = path.isAbsolute(child)
    ? path.resolve(child)
    : path.resolve(absRoot, child);
  const rel = path.relative(absRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathSafetyError(`path escapes root: ${child}`);
  }
  return resolved;
}

/** Derive a stable, filesystem-safe board id from its config path. */
export function slugifyBoardPath(configPath: string): string {
  const base = path.basename(configPath.replace(/[\\/]+$/, ''));
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a stable project id from its config path. Unlike boards, project
 * entries name a file rather than a directory, so the extension is stripped
 * first — otherwise `projects/meeseeks.yaml` would slug to `meeseeks-yaml`.
 */
export function slugifyProjectPath(configPath: string): string {
  const base = path.basename(configPath).replace(/\.ya?ml$/i, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Sanitize a free-form project name into a `<slug>.yaml` filename. */
export function buildProjectFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
  return `${slug}.yaml`;
}

/** Build a datetime-prefixed ticket filename (filesystem-safe). */
export function buildTicketFilename(title: string, now: Date = new Date()): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
  const ts = formatStamp(now);
  return `${ts}-${slug}.md`;
}

function formatStamp(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/** Sanitize a free-form prompt name into a `<slug>.md` filename. */
export function buildPromptFilename(name: string): string {
  const trimmed = name.trim().replace(/\.md$/i, '');
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
  return `${slug}.md`;
}

export function appendCollisionSuffix(filename: string, suffix: string): string {
  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  return `${base}-${suffix}${ext}`;
}

export function randomSuffix(): string {
  return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}
