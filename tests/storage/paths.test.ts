import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveWithin, slugifyBoardPath } from '../../src/storage/paths.js';
import { PathSafetyError } from '../../src/storage/errors.js';

describe('resolveWithin', () => {
  const root = path.resolve('/tmp/meeseeks-test');

  it('resolves a child path under the root', () => {
    expect(resolveWithin(root, 'a/b.md')).toBe(path.join(root, 'a/b.md'));
  });

  it('rejects parent traversal', () => {
    expect(() => resolveWithin(root, '../escape.md')).toThrow(PathSafetyError);
  });

  it('rejects absolute paths outside root', () => {
    expect(() => resolveWithin(root, '/etc/passwd')).toThrow(PathSafetyError);
  });

  it('accepts absolute paths inside root', () => {
    expect(resolveWithin(root, path.join(root, 'sub/x.md')))
      .toBe(path.join(root, 'sub/x.md'));
  });
});

describe('slugifyBoardPath', () => {
  it('produces a stable slug from a folder path', () => {
    expect(slugifyBoardPath('boards/my-board')).toBe('my-board');
  });

  it('lowercases and replaces non-alphanumerics', () => {
    expect(slugifyBoardPath('boards/My Board!')).toBe('my-board');
  });

  it('strips trailing slashes', () => {
    expect(slugifyBoardPath('boards/my-board/')).toBe('my-board');
  });
});
