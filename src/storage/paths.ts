import path from 'node:path';
import { PathSafetyError } from './errors.js';

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

export function appendCollisionSuffix(filename: string, suffix: string): string {
  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  return `${base}-${suffix}${ext}`;
}

export function randomSuffix(): string {
  return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}
