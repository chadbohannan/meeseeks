import { describe, it, expect } from 'vitest';
import {
  partitionAccepted, mergeAllowedTools, detectionKey,
} from '../../src/web/lib/detections.js';
import type { Detection } from '../../src/shared/types.js';

const d = (over: Partial<Detection>): Detection => ({
  kind: 'permission',
  value: 'Bash(npm test *)',
  reason: 'because',
  evidence: 'package.json',
  preselected: true,
  ...over,
});

describe('partitionAccepted', () => {
  it('routes permissions to allowedTools and a context proposal to contextFile', () => {
    const out = partitionAccepted([
      d({ value: 'Read(/repo/**)' }),
      d({ value: 'Bash(npm run test *)' }),
      d({ kind: 'context', value: '/repo/CLAUDE.md' }),
    ]);
    expect(out.allowedTools).toEqual(['Read(/repo/**)', 'Bash(npm run test *)']);
    expect(out.contextFile).toBe('/repo/CLAUDE.md');
  });

  // allowedPaths is the --add-dir list, which the project root already covers.
  it('never puts anything in allowedPaths, and drops a runtime proposal', () => {
    const out = partitionAccepted([d({ kind: 'runtime', value: 'opus' })]);
    expect(out.allowedTools).toEqual([]);
    expect(out.contextFile).toBeUndefined();
    expect('allowedPaths' in out).toBe(false);
  });

  // One contextFile field, and a repo can carry both files; the first accepted
  // wins so the outcome matches the order the user was reading.
  it('keeps the first context proposal when two are accepted', () => {
    const out = partitionAccepted([
      d({ kind: 'context', value: '/repo/CLAUDE.md' }),
      d({ kind: 'context', value: '/repo/AGENTS.md' }),
    ]);
    expect(out.contextFile).toBe('/repo/CLAUDE.md');
  });

  it('accepts nothing when nothing was ticked', () => {
    expect(partitionAccepted([])).toEqual({ allowedTools: [] });
  });
});

describe('mergeAllowedTools', () => {
  it('unions rather than replacing, so hand-written grants survive', () => {
    expect(mergeAllowedTools(['Bash(just build *)'], ['Read(/repo/**)']))
      .toEqual(['Bash(just build *)', 'Read(/repo/**)']);
  });

  it('does not duplicate a grant accepted twice', () => {
    expect(mergeAllowedTools(['Read(/repo/**)'], ['Read(/repo/**)']))
      .toEqual(['Read(/repo/**)']);
  });
});

describe('detectionKey', () => {
  it('separates a context proposal from a permission with the same value', () => {
    expect(detectionKey(d({ value: 'x' }))).not.toBe(detectionKey(d({ kind: 'context', value: 'x' })));
  });
});
