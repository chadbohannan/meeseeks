import { describe, it, expect } from 'vitest';
import { runPlaceholder, runHasEnded } from '../../src/web/lib/prompt-run.js';

describe('runPlaceholder', () => {
  // The bug this exists to prevent: a wiki lint runs for minutes without
  // emitting assistant text, and reporting that as "Starting…" reads as a hang.
  it('distinguishes not-yet-started from working-but-silent', () => {
    expect(runPlaceholder('starting')).toBe('Starting…');
    expect(runPlaceholder('running')).toContain('Running');
    expect(runPlaceholder('running')).not.toContain('Starting');
  });

  it('reports an idle agent as working rather than starting', () => {
    expect(runPlaceholder('idle')).not.toContain('Starting');
  });

  it('says there was no output once the run is over', () => {
    expect(runPlaceholder('exited')).toBe('(no output)');
    expect(runPlaceholder('errored')).toBe('(no output)');
  });

  it('has its own word for a run being stopped', () => {
    expect(runPlaceholder('terminating')).toBe('Stopping…');
  });
});

describe('runHasEnded', () => {
  it('trusts a terminal status', () => {
    expect(runHasEnded('exited', true)).toBe(true);
    expect(runHasEnded('errored', undefined)).toBe(true);
    expect(runHasEnded('terminating', true)).toBe(true);
  });

  // The supervisor drops a runtime on exit, so disappearing from the list is
  // how a client that missed the WebSocket events learns the run finished.
  it('treats absence from the runtime list as the end of the run', () => {
    expect(runHasEnded('starting', false)).toBe(true);
    expect(runHasEnded('running', false)).toBe(true);
  });

  it('keeps waiting while the runtime is still listed', () => {
    expect(runHasEnded('starting', true)).toBe(false);
    expect(runHasEnded('running', true)).toBe(false);
  });

  // An unfetched list is not evidence of anything; reading it as "gone" would
  // declare every run finished on the first render.
  it('does not treat an unfetched list as absence', () => {
    expect(runHasEnded('starting', undefined)).toBe(false);
    expect(runHasEnded(undefined, undefined)).toBe(false);
  });
});
