import { access } from 'node:fs/promises';
import yaml from 'js-yaml';

/** True when `p` is reachable. Every storage module needs this and only this. */
export async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Serialize a config to YAML. `lineWidth: -1` is not cosmetic: js-yaml wraps at
 * 80 columns by default, which folds long absolute paths and prompt text across
 * lines. That round-trips correctly, but it makes the files hostile to read and
 * to diff, and these are files a human is expected to open.
 */
export function dumpYaml(value: unknown): string {
  return yaml.dump(value, { lineWidth: -1 });
}
