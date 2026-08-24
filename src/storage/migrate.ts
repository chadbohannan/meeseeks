import {
  readFile, writeFile, mkdir, readdir, rename, stat, lstat, readlink, symlink, copyFile,
} from 'node:fs/promises';
import path from 'node:path';
import { exists, dumpYaml } from './io.js';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { parseRuntime } from './workspace.js';
import { buildProjectFilename, slugifyProjectPath } from './paths.js';
import type {
  WorkspaceConfig, RuntimeConfig, WorkflowState, PermissionsConfig, ProjectConfig,
} from '../shared/types.js';

/**
 * One-shot migration from the board-era layout to the workspace layout.
 *
 * Two properties shape every decision below.
 *
 * **It is a copy, not a move.** The board tree is renamed to `.pre-migrate`
 * with its contents intact, so a migration that gets something wrong costs a
 * directory rename to undo. This matters more than it looks: the workspace's
 * `.gitignore` excludes `boards/` and `project.yaml`, so none of the data being
 * migrated is in version control. The backup is the only safety net there is.
 *
 * **`project.yaml` is the trigger.** Its absence means the work is done, which
 * makes re-running a no-op without needing a marker file or a version stamp.
 */

const PRE_MIGRATE = '.pre-migrate';

/** Board-root entries consumed by a specific step rather than copied wholesale. */
const HANDLED_BOARD_ENTRIES = new Set([
  'board.yaml', 'lanes', 'prompts', '.claude',
  'CONTEXT.md', 'CLAUDE.md',   // folded into each workflow's PROCESS.md
  '.meeseeks',                 // generated per-run settings; regenerated on demand
  '.gitignore',                // scoped to the board directory, meaningless once moved
]);

export interface MigratedWorkflow {
  /** Board-relative source, e.g. `boards/meeseeks-board/lanes/feature-lane`. */
  from: string;
  /** Workspace registry entry, e.g. `workflows/feature-lane`. */
  entry: string;
  /** True when the target name was already taken and a suffix was applied. */
  suffixed: boolean;
  /** Whether the board's `runtime:` block was written into `workflow.yaml`. */
  runtimeCopied: boolean;
  ticketsTagged: number;
}

export interface SymlinkRewrite {
  /** Where the link now lives, workspace-relative. */
  at: string;
  from: string;
  to: string;
}

export interface MigrationReport {
  dryRun: boolean;
  workspaceRoot: string;
  /** False when there was no `project.yaml`, i.e. nothing to do. */
  migrated: boolean;
  workflows: MigratedWorkflow[];
  filesCopied: string[];
  symlinksRewritten: SymlinkRewrite[];
  /** Workspace-relative path of the project config, created or merged into. */
  projectConfig: string | null;
  grantsFolded: number;
  /**
   * Destinations that already existed. Reported rather than resolved: unlike a
   * workflow, a prompt or a skill has no id indirection, so silently suffixing
   * `lint.md` would leave the workspace with two prompts and no way to tell
   * which one anything referred to.
   */
  collisions: string[];
  /**
   * Files still naming `MEESEEKS_LANE_PATH`. The variable is now
   * `MEESEEKS_WORKFLOW_PATH`, but these are prose and scripts the migration
   * cannot safely edit, so they are surfaced for a human to resolve.
   */
  laneEnvRefs: string[];
  backups: string[];
  notes: string[];
}

interface Ctx {
  root: string;
  dryRun: boolean;
  report: MigrationReport;
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

function rel(ctx: Ctx, abs: string): string {
  return path.relative(ctx.root, abs) || '.';
}

/**
 * Read `workspace.yaml` if there is one. A pre-migration root usually has none,
 * and its absence is the normal case here rather than an error — which is why
 * this returns null instead of calling `readWorkspace`, whose contract is that
 * a missing workspace throws.
 */
async function readExistingWorkspace(root: string): Promise<WorkspaceConfig | null> {
  const p = path.join(root, 'workspace.yaml');
  if (!(await exists(p))) return null;
  const parsed = yaml.load(await readFile(p, 'utf8')) as Partial<WorkspaceConfig> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(root),
    workflows: strings(parsed.workflows),
    projects: strings(parsed.projects),
    models: parsed.models,
    runtime: parseRuntime(parsed.runtime),
  };
}

interface LegacyProject {
  name: string;
  boards: string[];
}

async function readLegacyProject(root: string): Promise<LegacyProject | null> {
  const p = path.join(root, 'project.yaml');
  if (!(await exists(p))) return null;
  const parsed = yaml.load(await readFile(p, 'utf8')) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(root),
    boards: Array.isArray(parsed.boards)
      ? parsed.boards.filter((b): b is string => typeof b === 'string')
      : [],
  };
}

// ---------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------

/**
 * Copy one entry, rewriting relative symlinks to absolute.
 *
 * A relative link is resolved against the directory it currently lives in, not
 * the one it is going to. `boards/<board>/wiki -> ../../wiki` and
 * `workflows/<workflow>/wiki -> ../../wiki` denote different targets, and the
 * failure is silent — a dangling `wiki` produces an agent that simply reports
 * no knowledge base rather than an error anyone sees.
 */
async function copyEntry(ctx: Ctx, src: string, dst: string): Promise<void> {
  const st = await lstat(src);

  if (st.isSymbolicLink()) {
    const target = await readlink(src);
    const absTarget = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(src), target);
    if (!path.isAbsolute(target)) {
      ctx.report.symlinksRewritten.push({ at: rel(ctx, dst), from: target, to: absTarget });
    }
    if (!ctx.dryRun) await symlink(absTarget, dst);
    return;
  }

  if (st.isDirectory()) {
    if (!ctx.dryRun) await mkdir(dst, { recursive: true });
    for (const name of await readdir(src)) {
      await copyEntry(ctx, path.join(src, name), path.join(dst, name));
    }
    return;
  }

  if (!ctx.dryRun) await copyFile(src, dst);
  ctx.report.filesCopied.push(rel(ctx, dst));
}

/** Copy `src` to `dst`, recording a collision and copying nothing if `dst` exists. */
async function copyEntrySafe(ctx: Ctx, src: string, dst: string): Promise<boolean> {
  if (await exists(dst)) {
    ctx.report.collisions.push(`${rel(ctx, dst)} already exists; left as-is, source kept in the backup`);
    return false;
  }
  await copyEntry(ctx, src, dst);
  return true;
}

/** Copy every child of `srcDir` into `dstDir`, per-entry collision reporting. */
async function copyChildren(ctx: Ctx, srcDir: string, dstDir: string): Promise<void> {
  if (!(await isDir(srcDir))) return;
  if (!ctx.dryRun) await mkdir(dstDir, { recursive: true });
  for (const name of await readdir(srcDir)) {
    await copyEntrySafe(ctx, path.join(srcDir, name), path.join(dstDir, name));
  }
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

function serializeWorkflow(name: string, states: WorkflowState[], runtime?: RuntimeConfig): string {
  const out: Record<string, unknown> = { name, states };
  if (runtime) out.runtime = runtime;
  return dumpYaml(out);
}

/**
 * Prepend the board's context document to the workflow's process document.
 *
 * The board context cannot become a workspace-root `CLAUDE.md` instead: the
 * harness reads that file natively from the cwd, and in a workspace that is
 * also a repository — the case this migration was written against — the file
 * is already the repository's own agent instructions. Folding into PROCESS.md
 * keeps the text without overwriting anything.
 */
function foldContext(context: string | null, processDoc: string, boardName: string): string {
  if (!context || context.trim() === '') return processDoc;
  const header = `<!-- Migrated from the "${boardName}" board's context document. -->\n\n`;
  return `${header}${context.trimEnd()}\n\n---\n\n${processDoc.trimStart()}`;
}

async function readIfPresent(p: string): Promise<string | null> {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

/** The board context file, under either the current name or the pre-rename one. */
async function readBoardContext(boardPath: string): Promise<string | null> {
  return (await readIfPresent(path.join(boardPath, 'CONTEXT.md')))
    ?? (await readIfPresent(path.join(boardPath, 'CLAUDE.md')));
}

function parseStates(raw: unknown): WorkflowState[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkflowState[] = [];
  for (const s of raw) {
    if (s && typeof s === 'object'
      && typeof (s as WorkflowState).dir === 'string'
      && typeof (s as WorkflowState).name === 'string') {
      out.push({ dir: (s as WorkflowState).dir, name: (s as WorkflowState).name });
    }
  }
  return out;
}

/**
 * Tag every ticket under a workflow with its project.
 *
 * Written directly rather than through `updateTicket` so `updated:` is
 * preserved. Migration is not an edit anyone made, and moving every ticket to
 * the top of a recently-touched sort would destroy real information.
 */
async function tagTickets(
  ctx: Ctx, workflowPath: string, states: WorkflowState[], projectId: string,
): Promise<number> {
  let tagged = 0;
  for (const state of states) {
    const dir = path.join(workflowPath, state.dir);
    if (!(await isDir(dir))) continue;
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.md')) continue;
      const abs = path.join(dir, name);
      const text = await readFile(abs, 'utf8');
      let parsed: matter.GrayMatterFile<string>;
      try { parsed = matter(text); } catch { continue; }
      const data = { ...(parsed.data as Record<string, unknown>) };
      if (typeof data.project === 'string' && data.project !== '') continue;
      data.project = projectId;
      if (!ctx.dryRun) await writeFile(abs, matter.stringify(parsed.content, data), 'utf8');
      tagged++;
    }
  }
  return tagged;
}

async function migrateLane(
  ctx: Ctx,
  lanePath: string,
  boardName: string,
  boardRuntime: RuntimeConfig | undefined,
  boardContext: string | null,
  taken: Set<string>,
): Promise<MigratedWorkflow> {
  const base = path.basename(lanePath);
  let slug = base;
  let n = 2;
  while (taken.has(slug)) { slug = `${base}-${n}`; n++; }
  taken.add(slug);

  const entry = `workflows/${slug}`;
  const dst = path.join(ctx.root, 'workflows', slug);
  await copyEntry(ctx, lanePath, dst);

  // lane.yaml -> workflow.yaml, with the board's runtime block copied in.
  // Every board's block lands in its own workflows, so no board's runtime is
  // discarded and there is nothing to tie-break.
  const laneYaml = (await readIfPresent(path.join(lanePath, 'lane.yaml')))
    ?? (await readIfPresent(path.join(lanePath, 'workflow.yaml')));
  const parsed = (laneYaml ? yaml.load(laneYaml) : null) as Record<string, unknown> | null;
  const states = parseStates(parsed?.states);
  const displayName = typeof parsed?.name === 'string' ? parsed.name : base;
  const runtime = parseRuntime(parsed?.runtime) ?? boardRuntime;

  if (!ctx.dryRun) {
    await writeFile(
      path.join(dst, 'workflow.yaml'),
      serializeWorkflow(displayName, states, runtime),
      'utf8',
    );
    const stale = path.join(dst, 'lane.yaml');
    if (await exists(stale)) await rename(stale, path.join(dst, `lane.yaml${PRE_MIGRATE}`));

    const processDoc = (await readIfPresent(path.join(lanePath, 'PROCESS.md'))) ?? '';
    await writeFile(
      path.join(dst, 'PROCESS.md'),
      foldContext(boardContext, processDoc, boardName),
      'utf8',
    );
  }

  return {
    from: rel(ctx, lanePath),
    entry,
    suffixed: slug !== base,
    runtimeCopied: runtime !== undefined,
    // Filled in by the caller once the project id is known.
    ticketsTagged: 0,
  };
}

// ---------------------------------------------------------------------------
// Project config
// ---------------------------------------------------------------------------

function mergePermissions(
  a: PermissionsConfig | undefined, b: PermissionsConfig,
): PermissionsConfig {
  const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    allowedPaths: union(a?.allowedPaths ?? [], b.allowedPaths),
    allowedTools: union(a?.allowedTools ?? [], b.allowedTools),
    deniedTools: union(a?.deniedTools ?? [], b.deniedTools),
  };
}

/**
 * Read a board's `.claude/settings.json` grants.
 *
 * These were additive to the settings file Meeseeks generates — Claude Code
 * resolves `.claude/` from the cwd, which used to be the board — so moving
 * them into the project config preserves behavior rather than changing it.
 * `allow` becomes `allowedTools` and not `allowedPaths`: every entry is a rule
 * in the tool grammar (`Read(...)`, `Bash(...)`, an MCP tool name), whereas
 * `allowedPaths` drives `--add-dir`, a different mechanism.
 */
async function readBoardGrants(boardPath: string): Promise<PermissionsConfig | null> {
  const text = await readIfPresent(path.join(boardPath, '.claude', 'settings.json'));
  if (!text) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const perms = (parsed as { permissions?: { allow?: unknown; deny?: unknown } })?.permissions;
  if (!perms) return null;
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const out: PermissionsConfig = {
    allowedPaths: [],
    allowedTools: list(perms.allow),
    deniedTools: list(perms.deny),
  };
  return out.allowedTools.length || out.deniedTools.length ? out : null;
}

function serializeProject(config: ProjectConfig): string {
  const out: Record<string, unknown> = { name: config.name, root: config.root };
  if (config.color !== undefined) out.color = config.color;
  if (config.permissions !== undefined) out.permissions = config.permissions;
  return dumpYaml(out);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface MigrateOptions {
  /** Report what would happen and write nothing. */
  dryRun?: boolean;
  /**
   * Codebase root for the generated project config. Defaults to the workspace
   * root, which is correct when the workspace lives inside the repository it
   * supervises — but a board never recorded this, so it cannot be inferred.
   */
  projectRoot?: string;
}

export async function migrateWorkspace(
  workspaceRoot: string,
  opts: MigrateOptions = {},
): Promise<MigrationReport> {
  const root = path.resolve(workspaceRoot);
  const report: MigrationReport = {
    dryRun: opts.dryRun ?? false,
    workspaceRoot: root,
    migrated: false,
    workflows: [],
    filesCopied: [],
    symlinksRewritten: [],
    projectConfig: null,
    grantsFolded: 0,
    collisions: [],
    laneEnvRefs: [],
    backups: [],
    notes: [],
  };
  const ctx: Ctx = { root, dryRun: report.dryRun, report };

  const legacy = await readLegacyProject(root);
  if (!legacy) {
    report.notes.push('No project.yaml found — this workspace is already migrated.');
    return report;
  }
  report.migrated = true;

  // Merge into whatever workspace.yaml already says rather than writing over
  // it. A workspace can acquire one before migrating: the server creates it on
  // first read, and any workflow made since then is real user data.
  const existing = await readExistingWorkspace(root);
  const config: WorkspaceConfig = existing ?? {
    name: legacy.name, workflows: [], projects: [],
  };
  if (existing) {
    report.notes.push(
      `Merged into the existing workspace.yaml (${existing.workflows.length} workflow(s) already registered).`,
    );
  }

  // Both registered entries and directories already sitting under `workflows/`
  // count as taken. An unregistered directory is still someone's data, and
  // copying a lane on top of it would merge two workflows into one.
  const taken = new Set<string>(config.workflows.map(w => path.basename(w)));
  const workflowsDir = path.join(root, 'workflows');
  if (await isDir(workflowsDir)) {
    for (const name of await readdir(workflowsDir)) taken.add(name);
  }
  const boardRuntimes: RuntimeConfig[] = [];

  for (const boardEntry of legacy.boards) {
    const boardPath = path.resolve(root, boardEntry);
    if (!(await isDir(boardPath))) {
      report.notes.push(`Board directory missing, skipped: ${boardEntry}`);
      continue;
    }
    const boardYaml = await readIfPresent(path.join(boardPath, 'board.yaml'));
    const boardCfg = (boardYaml ? yaml.load(boardYaml) : null) as Record<string, unknown> | null;
    const boardName = typeof boardCfg?.name === 'string' ? boardCfg.name : path.basename(boardPath);
    const boardRuntime = parseRuntime(boardCfg?.runtime);
    if (boardRuntime) boardRuntimes.push(boardRuntime);
    const boardContext = await readBoardContext(boardPath);

    const lanesDir = path.join(boardPath, 'lanes');
    if (await isDir(lanesDir)) {
      for (const name of await readdir(lanesDir)) {
        const lanePath = path.join(lanesDir, name);
        if (!(await isDir(lanePath))) continue;
        const migrated = await migrateLane(
          ctx, lanePath, boardName, boardRuntime, boardContext, taken,
        );
        report.workflows.push(migrated);
        if (!config.workflows.includes(migrated.entry)) config.workflows.push(migrated.entry);
      }
    }

    await copyChildren(ctx, path.join(boardPath, 'prompts'), path.join(root, 'prompts'));
    await copyChildren(ctx, path.join(boardPath, '.claude', 'skills'), path.join(root, '.claude', 'skills'));
    await copyChildren(ctx, path.join(boardPath, '.claude', 'bin'), path.join(root, '.claude', 'bin'));

    // Anything else at the board root — a `wiki` symlink, a stray doc — would
    // otherwise be stranded in the backup with no mention of it anywhere.
    for (const name of await readdir(boardPath)) {
      if (HANDLED_BOARD_ENTRIES.has(name)) continue;
      await copyEntrySafe(ctx, path.join(boardPath, name), path.join(root, name));
    }
  }

  // --- project config -------------------------------------------------------
  let grants: PermissionsConfig | undefined;
  for (const boardEntry of legacy.boards) {
    const found = await readBoardGrants(path.resolve(root, boardEntry));
    if (found) grants = mergePermissions(grants, found);
  }
  report.grantsFolded = (grants?.allowedTools.length ?? 0) + (grants?.deniedTools.length ?? 0);

  const projectFilename = buildProjectFilename(legacy.name);
  const projectEntry = `projects/${projectFilename}`;
  const projectAbs = path.join(root, 'projects', projectFilename);
  const projectId = slugifyProjectPath(projectEntry);

  const priorText = await readIfPresent(projectAbs);
  const prior = priorText ? (yaml.load(priorText) as Partial<ProjectConfig> | null) : null;
  const projectConfig: ProjectConfig = {
    name: typeof prior?.name === 'string' ? prior.name : legacy.name,
    root: typeof prior?.root === 'string' ? prior.root : path.resolve(opts.projectRoot ?? root),
    permissions: grants
      ? mergePermissions(prior?.permissions, grants)
      : prior?.permissions,
  };
  if (!ctx.dryRun) {
    await mkdir(path.dirname(projectAbs), { recursive: true });
    await writeFile(projectAbs, serializeProject(projectConfig), 'utf8');
  }
  report.projectConfig = projectEntry;
  if (!config.projects.includes(projectEntry)) config.projects.push(projectEntry);
  if (!opts.projectRoot && !prior) {
    report.notes.push(
      `Project root assumed to be the workspace root (${projectConfig.root}). `
      + 'A board did not record which codebase it worked on — check this.',
    );
  }

  // --- tickets --------------------------------------------------------------
  for (const wf of report.workflows) {
    // A dry run has not copied anything, so it reads the source tree instead —
    // safely, because every write below it is behind the same flag.
    const wfPath = ctx.dryRun ? path.resolve(root, wf.from) : path.join(root, wf.entry);
    const wfYaml = (await readIfPresent(path.join(wfPath, 'workflow.yaml')))
      ?? (await readIfPresent(path.join(wfPath, 'lane.yaml')));
    const wfCfg = (wfYaml ? yaml.load(wfYaml) : null) as Record<string, unknown> | null;
    wf.ticketsTagged = await tagTickets(ctx, wfPath, parseStates(wfCfg?.states), projectId);
  }

  // --- workspace.yaml -------------------------------------------------------
  if (!ctx.dryRun) {
    await writeFile(
      path.join(root, 'workspace.yaml'),
      dumpYaml(config),
      'utf8',
    );
  }

  // Deliberately not promoted to a workspace default. Boards each kept their
  // own, and picking one to become the default for every future workflow is a
  // choice this migration has no basis to make.
  if (boardRuntimes.length > 1 && !config.runtime) {
    report.notes.push(
      `${boardRuntimes.length} boards defined a runtime. Each was copied into its own `
      + 'workflows; no workspace default was set.',
    );
  }

  await findLaneEnvRefs(ctx);

  // --- backups --------------------------------------------------------------
  if (!ctx.dryRun) {
    for (const target of ['project.yaml', 'boards']) {
      const abs = path.join(root, target);
      if (!(await exists(abs))) continue;
      let backup = `${abs}${PRE_MIGRATE}`;
      let n = 2;
      while (await exists(backup)) { backup = `${abs}${PRE_MIGRATE}-${n}`; n++; }
      await rename(abs, backup);
      report.backups.push(rel(ctx, backup));
    }
  } else {
    report.backups.push(`project.yaml${PRE_MIGRATE}`, `boards${PRE_MIGRATE}`);
  }

  return report;
}

/**
 * Report — never rewrite — files naming the old environment variable. Whether
 * a mention in a process document or a shell script is safe to change depends
 * on what reads it, which this code cannot see.
 */
async function findLaneEnvRefs(ctx: Ctx): Promise<void> {
  const roots = ['workflows', 'prompts', path.join('.claude', 'skills'), path.join('.claude', 'bin')];
  for (const r of roots) {
    const abs = path.join(ctx.root, r);
    if (!(await isDir(abs))) continue;
    await walkForRefs(ctx, abs);
  }
}

async function walkForRefs(ctx: Ctx, dir: string): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { await walkForRefs(ctx, abs); continue; }
    const text = await readIfPresent(abs);
    if (text?.includes('MEESEEKS_LANE_PATH')) ctx.report.laneEnvRefs.push(rel(ctx, abs));
  }
}
