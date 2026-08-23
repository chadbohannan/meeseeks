import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { mkdir, writeFile, chmod, stat, readdir } from 'node:fs/promises';
import { detectProjectDefaults } from '../../src/storage/detect.js';
import { makeTmpProject } from '../helpers/tmp-project.js';
import type { Detection } from '../../src/shared/types.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

/** A fixture repository: a directory containing exactly the given files. */
async function fixture(files: Record<string, string>): Promise<string> {
  const tp = await makeTmpProject();
  cleanups.push(tp.cleanup);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(tp.root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, contents, 'utf8');
  }
  return tp.root;
}

const values = (ds: Detection[]): string[] => ds.map(d => d.value);

describe('detectProjectDefaults — per-ecosystem detectors', () => {
  it('proposes npm scripts the package.json actually declares', async () => {
    const root = await fixture({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest', typecheck: 'tsc', dev: 'vite', 'test:e2e': 'playwright' },
      }),
    });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(npm run test *)');
    expect(v).toContain('Bash(npm run typecheck *)');
    expect(v).toContain('Bash(npm run test:e2e *)');
    // `dev` is not a verification command, and nothing declares `lint` here.
    expect(v).not.toContain('Bash(npm run dev *)');
    expect(v).not.toContain('Bash(npm run lint *)');
  });

  it('stays silent on a repo with no evidence for it', async () => {
    const root = await fixture({ 'README.md': 'nothing to see' });
    const v = values(await detectProjectDefaults(root));
    expect(v.some(x => x.startsWith('Bash('))).toBe(false);
  });

  it('fires on Cargo.toml', async () => {
    const root = await fixture({ 'Cargo.toml': '[package]\nname = "thing"\n' });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(cargo test *)');
    expect(v).toContain('Bash(cargo check *)');
  });

  it('fires on pyproject.toml and on setup.py, proposing pytest once', async () => {
    const withToml = await fixture({ 'pyproject.toml': '[project]\nname = "thing"\n' });
    expect(values(await detectProjectDefaults(withToml))).toContain('Bash(pytest *)');

    const withSetup = await fixture({ 'setup.py': 'from setuptools import setup\n' });
    expect(values(await detectProjectDefaults(withSetup))).toContain('Bash(pytest *)');

    const withBoth = await fixture({ 'pyproject.toml': '', 'setup.py': '' });
    const pytest = values(await detectProjectDefaults(withBoth)).filter(v => v === 'Bash(pytest *)');
    expect(pytest).toHaveLength(1);
  });

  it('fires on go.mod', async () => {
    const root = await fixture({ 'go.mod': 'module example.com/thing\n' });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(go test *)');
    expect(v).toContain('Bash(go build *)');
  });

  it('reads Makefile targets and skips variable assignments', async () => {
    const root = await fixture({
      Makefile: 'CFLAGS := -O2\n\ntest:\n\tgo test ./...\n\nlint:\n\tgolangci-lint run\n\nrun:\n\t./thing\n',
    });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(make test *)');
    expect(v).toContain('Bash(make lint *)');
    expect(v).not.toContain('Bash(make run *)');
    expect(v.some(x => x.includes('CFLAGS'))).toBe(false);
  });

  it('proposes a context file when the repo has one', async () => {
    const root = await fixture({ 'CLAUDE.md': '# instructions' });
    const ds = await detectProjectDefaults(root);
    const ctx = ds.filter(d => d.kind === 'context');
    expect(ctx).toHaveLength(1);
    expect(ctx[0]!.value).toBe(path.join(root, 'CLAUDE.md'));
  });

  it("imports the repo's own .claude/settings.json grants verbatim", async () => {
    const root = await fixture({
      '.claude/settings.json': JSON.stringify({
        permissions: { allow: ['Bash(just test *)', 'mcp__code-rag__search'] },
      }),
    });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(just test *)');
    expect(v).toContain('mcp__code-rag__search');
  });

  it('always proposes read access to the root', async () => {
    const root = await fixture({ 'README.md': '' });
    expect(values(await detectProjectDefaults(root))).toContain(`Read(${root}/**)`);
  });
});

describe('detectProjectDefaults — the review step is real', () => {
  // The assertion most worth mutation-testing: flipping this default to true
  // must fail, or the checklist is decorative.
  it('returns Write and Edit proposals unselected', async () => {
    const root = await fixture({ 'src/index.ts': '', 'tests/a.test.ts': '' });
    const ds = await detectProjectDefaults(root);
    const writes = ds.filter(d => /^(Write|Edit)\(/.test(d.value));
    expect(writes.length).toBeGreaterThan(0);
    for (const d of writes) expect(d.preselected).toBe(false);
    expect(values(ds)).toContain(`Write(${path.join(root, 'src')}/**)`);
    expect(values(ds)).toContain(`Edit(${path.join(root, 'tests')}/**)`);
  });

  it('skips build output and dependency directories', async () => {
    const root = await fixture({
      'src/index.ts': '', 'node_modules/dep/index.js': '', 'dist/index.js': '', '.git/HEAD': '',
    });
    const v = values(await detectProjectDefaults(root)).join(' ');
    expect(v).toContain(path.join(root, 'src'));
    expect(v).not.toContain('node_modules');
    expect(v).not.toContain(path.join(root, 'dist'));
    expect(v).not.toContain('.git');
  });

  it('gives every proposal a reason and evidence', async () => {
    const root = await fixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'CLAUDE.md': '',
      'src/index.ts': '',
    });
    for (const d of await detectProjectDefaults(root)) {
      expect(d.reason.trim()).not.toBe('');
      expect(d.evidence.trim()).not.toBe('');
    }
  });
});

describe('detectProjectDefaults — combination and tolerance', () => {
  it('proposes from both a package.json and a Makefile without duplicates', async () => {
    const root = await fixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint' } }),
      Makefile: 'test:\n\tnpm test\nbuild:\n\ttsc\n',
    });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(npm run test *)');
    expect(v).toContain('Bash(npm run lint *)');
    expect(v).toContain('Bash(make test *)');
    expect(v).toContain('Bash(make build *)');
    expect(new Set(v).size).toBe(v.length);
  });

  it('dedupes a grant two detectors agree on', async () => {
    const root = await fixture({
      'go.mod': 'module example.com/thing\n',
      '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(go test *)'] } }),
    });
    const v = values(await detectProjectDefaults(root));
    expect(v.filter(x => x === 'Bash(go test *)')).toHaveLength(1);
  });

  it('returns [] for a root that does not exist rather than throwing', async () => {
    expect(await detectProjectDefaults('/definitely/not/here')).toEqual([]);
    expect(await detectProjectDefaults('')).toEqual([]);
  });

  it('returns [] when the root is a file rather than a directory', async () => {
    const root = await fixture({ 'thing.txt': '' });
    expect(await detectProjectDefaults(path.join(root, 'thing.txt'))).toEqual([]);
  });

  it('skips a malformed package.json and still proposes from other evidence', async () => {
    const root = await fixture({
      'package.json': '{ this is not json',
      'go.mod': 'module example.com/thing\n',
    });
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(go test *)');
    expect(v.some(x => x.startsWith('Bash(npm'))).toBe(false);
  });

  it('skips an unreadable file and still returns other detections', async () => {
    const root = await fixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'Cargo.toml': '[package]\n',
    });
    await chmod(path.join(root, 'package.json'), 0o000);
    const v = values(await detectProjectDefaults(root));
    expect(v).toContain('Bash(cargo test *)');
    // Restored so cleanup can remove it.
    await chmod(path.join(root, 'package.json'), 0o644);
  });

  it('writes nothing to the repository it inspects', async () => {
    const root = await fixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'src/index.ts': '',
      'CLAUDE.md': '',
    });
    const snapshot = async () => {
      const out: Record<string, string> = {};
      for (const name of (await readdir(root)).sort()) {
        const s = await stat(path.join(root, name));
        out[name] = `${s.size}:${s.mtimeMs}`;
      }
      return out;
    };
    const before = await snapshot();
    await detectProjectDefaults(root);
    expect(await snapshot()).toEqual(before);
  });
});
