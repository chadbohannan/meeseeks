// Imported relatively rather than through the `@shared/*` alias so the server
// tsconfig — which does not define that path — can pull this module into
// `tests/`, the same arrangement model-options.ts and detections.ts use.
import type { RuntimeStatus } from '../../shared/runtime.js';

/**
 * What a prompt-run modal says before any output has arrived.
 *
 * An agent working a long task — a wiki lint spends minutes on tool calls —
 * emits no assistant text until it has something to say, so "no output yet" is
 * the normal state for most of a run. Reporting that as "Starting…" the whole
 * time reads as a hang, which is the one thing it is not. The distinction
 * between *has not started* and *is working, quietly* is the only information
 * this line can carry, so it carries it.
 */
export function runPlaceholder(status: RuntimeStatus): string {
  switch (status) {
    case 'starting': return 'Starting…';
    case 'terminating': return 'Stopping…';
    case 'exited':
    case 'errored': return '(no output)';
    default:
      return 'Running — no output yet. Long tasks stay silent until the agent has something to report.';
  }
}

/**
 * Has this run finished, as far as this client can tell?
 *
 * Live status arrives over the WebSocket and nowhere else, and the supervisor
 * deletes a runtime from its map the moment it exits. A client that missed
 * those events — dropped socket, reload mid-run — would otherwise sit on its
 * last known status forever, which is how a completed run looks like a hung
 * one. Absence from the runtime list is the second, pollable signal.
 *
 * `stillListed` is undefined while the list has not been fetched; that is not
 * evidence of anything and must not be read as "gone".
 */
export function runHasEnded(
  status: RuntimeStatus | undefined,
  stillListed: boolean | undefined,
): boolean {
  if (status === 'exited' || status === 'errored' || status === 'terminating') return true;
  return stillListed === false;
}
