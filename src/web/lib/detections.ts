// Imported relatively rather than through the `@shared/*` alias so the server
// tsconfig — which does not define that path — can pull this module into
// `tests/`, the same arrangement model-options.ts uses. The folding rules below
// are pure on purpose: they are the part worth testing, and the repository has
// no DOM test harness.
import type { Detection } from '../../shared/types.js';

export interface AcceptedDetections {
  /** Tool patterns to union into the project's auto-approved tools. */
  allowedTools: string[];
  /** Absolute path to a context document, if one was accepted. */
  contextFile?: string;
}

/**
 * Fold the rows a user ticked into the fields they belong in.
 *
 * Every permission the detector proposes is a tool pattern — `Read(…)`,
 * `Bash(…)`, an `mcp__` name — so nothing lands in `allowedPaths`, which is the
 * `--add-dir` list the project root already covers. A `runtime` proposal has no
 * field to land in yet and is dropped rather than guessed at.
 */
export function partitionAccepted(accepted: Detection[]): AcceptedDetections {
  const out: AcceptedDetections = { allowedTools: [] };
  for (const d of accepted) {
    if (d.kind === 'context') out.contextFile = d.value;
    else if (d.kind === 'permission') out.allowedTools.push(d.value);
  }
  return out;
}

/**
 * Union, never replace: accepting a proposal must not silently drop a grant the
 * user wrote by hand, and accepting the same detection twice must not duplicate
 * it.
 */
export function mergeAllowedTools(existing: string[], accepted: string[]): string[] {
  return [...new Set([...existing, ...accepted])];
}

/** The keys a checklist ticks, stable across a re-run against the same repo. */
export function detectionKey(d: Detection): string {
  return `${d.kind} ${d.value}`;
}
