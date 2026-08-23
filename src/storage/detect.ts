import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { expandHome } from './paths.js';
import type { Detection } from '../shared/types.js';

/**
 * Deterministic inspection of a registered project's root, proposing starting
 * values for its config.
 *
 * Detection **never writes** — not to the project config, and not to the
 * repository it reads. It returns proposals that a caller shows for review, and
 * only what the user accepts is written. An unreviewed permission grant is a
 * security-relevant default, and the difference between "your repo declares a
 * test script, allow it?" and "test script allowed" is the difference between a
 * tool that gets trusted and one that does not.
 *
 * Every proposal carries `reason` and `evidence` because those are what make it
 * reviewable: a user who cannot see why a grant was suggested has no basis for
 * accepting it, and the checklist becomes a formality.
 *
 * It is deliberately not an LLM pass. A model would write better prose than a
 * file-existence check, and would do it non-reproducibly, at a cost, over the
 * network, at the exact moment a new user is deciding whether this tool works.
 */

/** Directories that are build output or vendored dependencies, not source. */
const NON_SOURCE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '__pycache__', '.venv', 'venv', 'tmp', 'bin', 'obj', 'Pods',
]);

/**
 * Script and target names worth proposing a grant for. Matched as substrings of
 * what the file *declares* rather than probed for by name: a repo whose script
 * is `test:unit` gets a proposal, and a repo with no script matching any of
 * these gets none rather than a grant for a command that does not exist.
 */
const VERIFY_NAMES = ['test', 'lint', 'typecheck', 'check', 'build', 'format'];

function isVerifyName(name: string): boolean {
  const lower = name.toLowerCase();
  return VERIFY_NAMES.some(v => lower.includes(v));
}

async function readText(file: string): Promise<string | null> {
  try { return await readFile(file, 'utf8'); } catch { return null; }
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function isFile(p: string): Promise<boolean> {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

interface Ctx {
  root: string;
  add(d: Detection): void;
}

async function detectNpm(ctx: Ctx): Promise<void> {
  const evidence = 'package.json';
  const text = await readText(path.join(ctx.root, evidence));
  if (text === null) return;
  let scripts: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as { scripts?: Record<string, unknown> };
    scripts = parsed?.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    return; // malformed package.json is skipped, not fatal
  }
  for (const name of Object.keys(scripts)) {
    if (!isVerifyName(name)) continue;
    ctx.add({
      kind: 'permission',
      value: `Bash(npm run ${name} *)`,
      reason: `package.json declares a "${name}" script`,
      evidence,
      preselected: true,
    });
  }
}

async function detectCargo(ctx: Ctx): Promise<void> {
  const evidence = 'Cargo.toml';
  if (!(await isFile(path.join(ctx.root, evidence)))) return;
  for (const cmd of ['cargo test', 'cargo check']) {
    ctx.add({
      kind: 'permission',
      value: `Bash(${cmd} *)`,
      reason: 'Cargo.toml marks this a Rust crate',
      evidence,
      preselected: true,
    });
  }
}

async function detectPython(ctx: Ctx): Promise<void> {
  for (const evidence of ['pyproject.toml', 'setup.py']) {
    if (!(await isFile(path.join(ctx.root, evidence)))) continue;
    ctx.add({
      kind: 'permission',
      value: 'Bash(pytest *)',
      reason: `${evidence} marks this a Python project`,
      evidence,
      preselected: true,
    });
    return;
  }
}

async function detectGo(ctx: Ctx): Promise<void> {
  const evidence = 'go.mod';
  if (!(await isFile(path.join(ctx.root, evidence)))) return;
  for (const cmd of ['go test', 'go build']) {
    ctx.add({
      kind: 'permission',
      value: `Bash(${cmd} *)`,
      reason: 'go.mod marks this a Go module',
      evidence,
      preselected: true,
    });
  }
}

/**
 * Targets are read off the left of `name:` lines. This misses generated and
 * included targets, which is the right failure: a proposal for a target that
 * does not exist is worse than a missing proposal the user can add by hand.
 */
async function detectMake(ctx: Ctx): Promise<void> {
  const evidence = 'Makefile';
  const text = await readText(path.join(ctx.root, evidence));
  if (text === null) return;
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*:(?!=)/.exec(line);
    if (!m) continue;
    const target = m[1] ?? '';
    if (!isVerifyName(target)) continue;
    ctx.add({
      kind: 'permission',
      value: `Bash(make ${target} *)`,
      reason: `Makefile declares a "${target}" target`,
      evidence,
      preselected: true,
    });
  }
}

async function detectContextFile(ctx: Ctx): Promise<void> {
  for (const evidence of ['CLAUDE.md', 'AGENTS.md']) {
    if (!(await isFile(path.join(ctx.root, evidence)))) continue;
    ctx.add({
      kind: 'context',
      value: path.join(ctx.root, evidence),
      reason: `${evidence} at the repository root already describes this codebase`,
      evidence,
      preselected: true,
    });
  }
}

/**
 * A repo's own `.claude/settings.json` is imported as a one-time copy of the
 * grants it declares, shown like any other proposal. It is never read again at
 * spawn time: the workflow collapse found such a file silently adding to
 * Meeseeks-generated permissions, and one source of truth per grant is the
 * whole point of moving it into the project config.
 */
async function detectClaudeSettings(ctx: Ctx): Promise<void> {
  const evidence = path.join('.claude', 'settings.json');
  const text = await readText(path.join(ctx.root, evidence));
  if (text === null) return;
  let allow: unknown;
  try {
    allow = (JSON.parse(text) as { permissions?: { allow?: unknown } })?.permissions?.allow;
  } catch {
    return;
  }
  if (!Array.isArray(allow)) return;
  for (const entry of allow) {
    if (typeof entry !== 'string' || entry.trim() === '') continue;
    ctx.add({
      kind: 'permission',
      value: entry,
      reason: "granted by the repository's own .claude/settings.json",
      evidence,
      preselected: true,
    });
  }
}

/** Read access to the root is implied by registering it, so it is always proposed. */
function detectRootRead(ctx: Ctx): void {
  ctx.add({
    kind: 'permission',
    value: `Read(${ctx.root}/**)`,
    reason: 'read access to the registered project root',
    evidence: '.',
    preselected: true,
  });
}

/**
 * Write and Edit come back **unselected**. Read access to a repository and
 * write access to it are different decisions, and defaulting the second one on
 * would make the review step decorative.
 */
async function detectSourceDirs(ctx: Ctx): Promise<void> {
  let entries;
  try {
    entries = await readdir(ctx.root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || NON_SOURCE_DIRS.has(e.name)) continue;
    for (const tool of ['Write', 'Edit']) {
      ctx.add({
        kind: 'permission',
        value: `${tool}(${path.join(ctx.root, e.name)}/**)`,
        reason: `"${e.name}" is a top-level directory in this repository`,
        evidence: `${e.name}/`,
        preselected: false,
      });
    }
  }
}

/**
 * Inspect `root` and return proposals for the project config.
 *
 * A root that does not exist returns `[]` rather than throwing: an unavailable
 * project root is already a represented state (`ProjectSummary.available`), and
 * a user mid-typing a path should not be met with an error.
 */
export async function detectProjectDefaults(root: string): Promise<Detection[]> {
  if (!root) return [];
  const abs = path.resolve(expandHome(root));
  if (!(await isDir(abs))) return [];

  // Deduped by kind and value so a repo with both a package.json and a Makefile
  // proposes from both without repeating a grant the two agree on. First writer
  // wins, which keeps the earlier detector's reason attached.
  const byKey = new Map<string, Detection>();
  const ctx: Ctx = {
    root: abs,
    add(d) {
      const key = `${d.kind} ${d.value}`;
      if (!byKey.has(key)) byKey.set(key, d);
    },
  };

  detectRootRead(ctx);
  await detectNpm(ctx);
  await detectCargo(ctx);
  await detectPython(ctx);
  await detectGo(ctx);
  await detectMake(ctx);
  await detectClaudeSettings(ctx);
  await detectContextFile(ctx);
  await detectSourceDirs(ctx);

  return [...byKey.values()];
}
