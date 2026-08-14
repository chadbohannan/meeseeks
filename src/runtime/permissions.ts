import path from 'node:path';
import { expandHome } from '../storage/paths.js';
import type {
  PermissionsConfig, PermissionOrigin, ResolvedPermissions, ResolvedPermissionEntry,
} from '../shared/types.js';

/**
 * One contributing config, tagged with where it came from and what its relative
 * `allowedPaths` entries resolve against.
 *
 * The base travels with the source because it differs per origin: a workflow's
 * `../shared` is relative to the workflow directory, a project's `./vendor` to that
 * project's root. Paths must therefore be made absolute *before* the union —
 * once merged, an entry no longer knows which base it needed.
 */
export interface PermissionSource {
  origin: PermissionOrigin;
  base: string;
  config: PermissionsConfig | null;
}

function resolvePath(value: string, base: string): string {
  const expanded = expandHome(value);
  return path.isAbsolute(expanded) ? expanded : path.resolve(base, expanded);
}

function merge(
  sources: PermissionSource[],
  pick: (config: PermissionsConfig) => string[],
  map?: (value: string, source: PermissionSource) => string,
): ResolvedPermissionEntry[] {
  const byValue = new Map<string, ResolvedPermissionEntry>();
  for (const source of sources) {
    if (!source.config) continue;
    for (const raw of pick(source.config)) {
      const value = map ? map(raw, source) : raw;
      const existing = byValue.get(value);
      if (existing) {
        if (!existing.origins.includes(source.origin)) existing.origins.push(source.origin);
      } else {
        byValue.set(value, { value, origins: [source.origin] });
      }
    }
  }
  return [...byValue.values()];
}

/**
 * Union every source's permissions. There is deliberately no precedence logic
 * here: restriction lives only in `deniedTools`, and Claude Code already
 * resolves deny over allow regardless of which config contributed the entry.
 * A union therefore lets both the workflow and the project enforce a floor that the
 * other cannot undo, which wholesale replacement would not.
 *
 * Returns null when no source carries a config, so callers can keep omitting
 * the settings file's `permissions` key entirely.
 */
export function resolvePermissions(sources: PermissionSource[]): ResolvedPermissions | null {
  const active = sources.filter(s => s.config !== null);
  if (active.length === 0) return null;
  return {
    allowedPaths: merge(active, c => c.allowedPaths, (v, s) => resolvePath(v, s.base)),
    allowedTools: merge(active, c => c.allowedTools),
    deniedTools: merge(active, c => c.deniedTools),
  };
}

/** Flatten to plain strings for the harness, discarding provenance. */
export function permissionValues(entries: ResolvedPermissionEntry[]): string[] {
  return entries.map(e => e.value);
}
