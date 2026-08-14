import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, readdir, mkdir, symlink, readlink, access, lstat } from 'node:fs/promises';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { migrateWorkspace } from '../../src/storage/migrate.js';
import { listWorkflows, resolveWorkflowRuntime } from '../../src/storage/workflow.js';
import { listProjects, getProject } from '../../src/storage/project.js';
import { makeTmpProject, writeText, writeYaml } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

const LANE_YAML = `name: feature lane
states:
  - dir: todo
    name: Todo
  - dir: done
    name: Done
`;

interface BoardSpec {
  board: string;
  lanes?: string[];
  runtimeModel?: string;
  context?: { filename: 'CONTEXT.md' | 'CLAUDE.md'; body: string };
  settings?: Record<string, unknown>;
  prompts?: Record<string, string>;
  bin?: Record<string, string>;
}

/** Build a board-era workspace on disk. */
async function makeLegacyWorkspace(boards: BoardSpec[], projectName = 'meeseeks') {
  const tp = await makeTmpProject();
  cleanups.push(tp.cleanup);
  await writeYaml(
    path.join(tp.root, 'project.yaml'),
    `name: ${projectName}\nboards:\n${boards.map(b => `  - boards/${b.board}\n`).join('')}`,
  );
  for (const spec of boards) {
    const bp = path.join(tp.root, 'boards', spec.board);
    const runtime = spec.runtimeModel
      ? `runtime:\n  harness: claude-code\n  provider: anthropic\n  model: ${spec.runtimeModel}\n  args: []\n  env: {}\n`
      : '';
    await writeYaml(path.join(bp, 'board.yaml'), `${runtime}name: ${spec.board}\n`);
    if (spec.context) {
      await writeText(path.join(bp, spec.context.filename), spec.context.body);
    }
    for (const lane of spec.lanes ?? ['feature-lane']) {
      const lp = path.join(bp, 'lanes', lane);
      await writeYaml(path.join(lp, 'lane.yaml'), LANE_YAML);
      await writeText(path.join(lp, 'PROCESS.md'), `# ${lane} Process\n\nDo the work.\n`);
      await writeYaml(path.join(lp, 'permissions.yaml'), 'allowedPaths: []\nallowedTools: []\ndeniedTools: []\n');
      await mkdir(path.join(lp, 'done'), { recursive: true });
      await writeText(
        path.join(lp, 'todo', 'a-ticket.md'),
        '---\ntitle: A ticket\ncreated: \'2026-01-01T00:00:00.000Z\'\nupdated: \'2026-01-02T00:00:00.000Z\'\n---\n\nBody.\n',
      );
    }
    if (spec.settings) {
      await writeText(path.join(bp, '.claude', 'settings.json'), JSON.stringify(spec.settings));
    }
    for (const [name, body] of Object.entries(spec.prompts ?? {})) {
      await writeText(path.join(bp, 'prompts', name), body);
    }
    for (const [name, body] of Object.entries(spec.bin ?? {})) {
      await writeText(path.join(bp, '.claude', 'bin', name), body);
    }
  }
  return tp;
}

const readYaml = async <T>(p: string): Promise<T> => yaml.load(await readFile(p, 'utf8')) as T;

describe('migrateWorkspace', () => {
  it('rewrites project.yaml into workspace.yaml with workflows', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'meeseeks-board' }]);
    const report = await migrateWorkspace(tp.root);

    expect(report.migrated).toBe(true);
    const ws = await readYaml<{ name: string; workflows: string[]; projects: string[] }>(
      path.join(tp.root, 'workspace.yaml'),
    );
    expect(ws.name).toBe('meeseeks');
    expect(ws.workflows).toEqual(['workflows/feature-lane']);
    expect(ws.projects).toEqual(['projects/meeseeks.yaml']);
    // The registry must actually resolve, not merely look right.
    const workflows = await listWorkflows(tp.root);
    expect(workflows.map(w => w.workflowName)).toEqual(['feature-lane']);
    expect(workflows[0]!.available).toBe(true);
  });

  it('renames lane.yaml to workflow.yaml preserving name and states', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    await migrateWorkspace(tp.root);

    const wf = await readYaml<{ name: string; states: Array<{ dir: string; name: string }> }>(
      path.join(tp.root, 'workflows/feature-lane/workflow.yaml'),
    );
    expect(wf.name).toBe('feature lane');
    expect(wf.states).toEqual([{ dir: 'todo', name: 'Todo' }, { dir: 'done', name: 'Done' }]);
    // The old file must not remain readable as a workflow config.
    expect(await exists(path.join(tp.root, 'workflows/feature-lane/lane.yaml'))).toBe(false);
  });

  it('suffixes colliding lane names across boards', async () => {
    const tp = await makeLegacyWorkspace([
      { board: 'alpha', lanes: ['dev'] },
      { board: 'beta', lanes: ['dev'] },
    ]);
    const report = await migrateWorkspace(tp.root);

    expect(report.workflows.map(w => w.entry)).toEqual(['workflows/dev', 'workflows/dev-2']);
    expect(report.workflows[1]!.suffixed).toBe(true);
    const names = (await listWorkflows(tp.root)).map(w => w.workflowName);
    expect(names).toEqual(['dev', 'dev-2']);
  });

  it('gives every board its own runtime block, discarding none', async () => {
    const tp = await makeLegacyWorkspace([
      { board: 'alpha', lanes: ['one'], runtimeModel: 'opus' },
      { board: 'beta', lanes: ['two'], runtimeModel: 'sonnet' },
    ]);
    await migrateWorkspace(tp.root);

    const one = await resolveWorkflowRuntime(tp.root, 'one');
    const two = await resolveWorkflowRuntime(tp.root, 'two');
    expect(one.runtime?.model).toBe('opus');
    expect(two.runtime?.model).toBe('sonnet');
    // Owned by the workflow, not inherited — there is no workspace default.
    expect(one.inherited).toBe(false);
    expect(two.inherited).toBe(false);
    // No board's runtime is promoted to a workspace default.
    const ws = await readYaml<{ runtime?: unknown }>(path.join(tp.root, 'workspace.yaml'));
    expect(ws.runtime).toBeUndefined();
  });

  it('prepends the board context to PROCESS.md', async () => {
    const tp = await makeLegacyWorkspace([
      { board: 'b', context: { filename: 'CONTEXT.md', body: 'Board-wide rules.\n' } },
    ]);
    await migrateWorkspace(tp.root);

    const doc = await readFile(path.join(tp.root, 'workflows/feature-lane/PROCESS.md'), 'utf8');
    expect(doc).toContain('Board-wide rules.');
    expect(doc).toContain('# feature-lane Process');
    expect(doc.indexOf('Board-wide rules.')).toBeLessThan(doc.indexOf('# feature-lane Process'));
  });

  it('accepts CLAUDE.md as the board context file', async () => {
    // Boards created before the rename still carry the old filename, and the
    // board reader that used to migrate it on read no longer exists.
    const tp = await makeLegacyWorkspace([
      { board: 'b', context: { filename: 'CLAUDE.md', body: 'Legacy context.\n' } },
    ]);
    await migrateWorkspace(tp.root);

    const doc = await readFile(path.join(tp.root, 'workflows/feature-lane/PROCESS.md'), 'utf8');
    expect(doc).toContain('Legacy context.');
    // It must not land at the workspace root, where it would collide with the
    // repository's own agent instructions.
    expect(await exists(path.join(tp.root, 'CLAUDE.md'))).toBe(false);
  });

  it('folds board settings.json grants into the project config and drops the file', async () => {
    const tp = await makeLegacyWorkspace([{
      board: 'b',
      settings: { permissions: { allow: ['Bash(npm test *)', 'Read(/repo/**)'], deny: ['Bash(rm *)'] } },
    }]);
    await writeText(path.join(tp.root, 'boards/b/.claude/settings.local.json'), '{"permissions":{"allow":[]}}');

    const report = await migrateWorkspace(tp.root);
    expect(report.grantsFolded).toBe(3);

    const project = await getProject(tp.root, 'meeseeks');
    expect(project.permissions?.allowedTools).toEqual(['Bash(npm test *)', 'Read(/repo/**)']);
    expect(project.permissions?.deniedTools).toEqual(['Bash(rm *)']);
    // Neither settings file is copied to the workspace root: the grants moved
    // into config, and settings.local.json is agent-written churn.
    expect(await exists(path.join(tp.root, '.claude/settings.json'))).toBe(false);
    expect(await exists(path.join(tp.root, '.claude/settings.local.json'))).toBe(false);
  });

  it('reports prompt collisions rather than merging them', async () => {
    const tp = await makeLegacyWorkspace([
      { board: 'alpha', lanes: ['one'], prompts: { 'lint.md': 'alpha version' } },
      { board: 'beta', lanes: ['two'], prompts: { 'lint.md': 'beta version' } },
    ]);
    const report = await migrateWorkspace(tp.root);

    expect(report.collisions.some(c => c.includes('prompts/lint.md'))).toBe(true);
    // The first writer wins and the loser is left in the backup, intact.
    expect(await readFile(path.join(tp.root, 'prompts/lint.md'), 'utf8')).toBe('alpha version');
    expect(
      await readFile(path.join(tp.root, 'boards.pre-migrate/beta/prompts/lint.md'), 'utf8'),
    ).toBe('beta version');
  });

  it('rewrites relative symlinks to absolute targets', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    await mkdir(path.join(tp.root, 'wiki'), { recursive: true });
    await writeText(path.join(tp.root, 'wiki', 'index.md'), '# Wiki\n');
    // Four levels up from boards/b/lanes/feature-lane/ reaches the workspace
    // root. From workflows/feature-lane/ the same text would reach two levels
    // above it — the whole reason the target has to be recomputed.
    await symlink('../../../../wiki', path.join(tp.root, 'boards/b/lanes/feature-lane/wiki'));

    const report = await migrateWorkspace(tp.root);

    const linkPath = path.join(tp.root, 'workflows/feature-lane/wiki');
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(linkPath)).toBe(path.join(tp.root, 'wiki'));
    // Still resolves to the same content it did before the move.
    expect(await readFile(path.join(linkPath, 'index.md'), 'utf8')).toBe('# Wiki\n');
    expect(report.symlinksRewritten).toHaveLength(1);
  });

  it('tags every ticket with the project without touching updated', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    const report = await migrateWorkspace(tp.root);

    expect(report.workflows[0]!.ticketsTagged).toBe(1);
    const raw = await readFile(path.join(tp.root, 'workflows/feature-lane/todo/a-ticket.md'), 'utf8');
    const fm = matter(raw).data as Record<string, unknown>;
    expect(fm.project).toBe('meeseeks');
    expect(fm.updated).toBe('2026-01-02T00:00:00.000Z');
  });

  it('merges into an existing workspace.yaml instead of overwriting it', async () => {
    // The server creates workspace.yaml on first read, and a workflow made
    // since then is real data that migration must not drop.
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    await writeYaml(
      path.join(tp.root, 'workspace.yaml'),
      'name: my workspace\nworkflows:\n  - workflows/development\nprojects: []\n',
    );
    await writeYaml(path.join(tp.root, 'workflows/development/workflow.yaml'), 'name: Development\nstates:\n  - dir: todo\n    name: Todo\n');

    const report = await migrateWorkspace(tp.root);

    const ws = await readYaml<{ name: string; workflows: string[] }>(path.join(tp.root, 'workspace.yaml'));
    expect(ws.name).toBe('my workspace');
    expect(ws.workflows).toEqual(['workflows/development', 'workflows/feature-lane']);
    expect(report.notes.some(n => n.includes('existing workspace.yaml'))).toBe(true);
  });

  it('suffixes a lane whose name matches an unregistered directory', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b', lanes: ['dev'] }]);
    await writeYaml(path.join(tp.root, 'workflows/dev/workflow.yaml'), 'name: Existing\nstates: []\n');

    await migrateWorkspace(tp.root);

    // The pre-existing directory is untouched; the lane lands beside it.
    const existing = await readYaml<{ name: string }>(path.join(tp.root, 'workflows/dev/workflow.yaml'));
    expect(existing.name).toBe('Existing');
    expect(await exists(path.join(tp.root, 'workflows/dev-2/workflow.yaml'))).toBe(true);
  });

  it('backs up the originals rather than deleting them', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    const report = await migrateWorkspace(tp.root);

    expect(report.backups).toEqual(['project.yaml.pre-migrate', 'boards.pre-migrate']);
    expect(await exists(path.join(tp.root, 'project.yaml'))).toBe(false);
    expect(await exists(path.join(tp.root, 'boards'))).toBe(false);
    expect(
      await exists(path.join(tp.root, 'boards.pre-migrate/b/lanes/feature-lane/lane.yaml')),
    ).toBe(true);
  });

  it('is a no-op on a second run', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    await migrateWorkspace(tp.root);
    const before = await readFile(path.join(tp.root, 'workspace.yaml'), 'utf8');
    const listBefore = await readdir(path.join(tp.root, 'workflows'));

    const second = await migrateWorkspace(tp.root);

    expect(second.migrated).toBe(false);
    expect(second.workflows).toHaveLength(0);
    expect(await readFile(path.join(tp.root, 'workspace.yaml'), 'utf8')).toBe(before);
    expect(await readdir(path.join(tp.root, 'workflows'))).toEqual(listBefore);
  });

  it('reports MEESEEKS_LANE_PATH references without rewriting them', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b', bin: { 'run.sh': 'cd "$MEESEEKS_LANE_PATH"\n' } }]);
    const report = await migrateWorkspace(tp.root);

    expect(report.laneEnvRefs).toContain('.claude/bin/run.sh');
    expect(await readFile(path.join(tp.root, '.claude/bin/run.sh'), 'utf8'))
      .toContain('MEESEEKS_LANE_PATH');
  });

  it('records a project whose root defaults to the workspace root', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    const report = await migrateWorkspace(tp.root);

    const projects = await listProjects(tp.root);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.root).toBe(path.resolve(tp.root));
    expect(report.notes.some(n => n.includes('Project root assumed'))).toBe(true);
  });

  it('honours an explicit project root', async () => {
    const tp = await makeLegacyWorkspace([{ board: 'b' }]);
    await migrateWorkspace(tp.root, { projectRoot: '/srv/code' });

    const projects = await listProjects(tp.root);
    expect(projects[0]!.root).toBe('/srv/code');
  });

  describe('dry run', () => {
    it('reports the same plan but writes nothing', async () => {
      const tp = await makeLegacyWorkspace([{ board: 'b' }]);
      const report = await migrateWorkspace(tp.root, { dryRun: true });

      expect(report.migrated).toBe(true);
      expect(report.workflows.map(w => w.entry)).toEqual(['workflows/feature-lane']);
      expect(report.workflows[0]!.ticketsTagged).toBe(1);

      expect(await exists(path.join(tp.root, 'workflows'))).toBe(false);
      expect(await exists(path.join(tp.root, 'projects'))).toBe(false);
      expect(await exists(path.join(tp.root, 'workspace.yaml'))).toBe(false);
      expect(await exists(path.join(tp.root, 'project.yaml'))).toBe(true);
      expect(await exists(path.join(tp.root, 'boards'))).toBe(true);
    });

    it('leaves ticket frontmatter untouched', async () => {
      const tp = await makeLegacyWorkspace([{ board: 'b' }]);
      const ticket = path.join(tp.root, 'boards/b/lanes/feature-lane/todo/a-ticket.md');
      const before = await readFile(ticket, 'utf8');

      await migrateWorkspace(tp.root, { dryRun: true });

      expect(await readFile(ticket, 'utf8')).toBe(before);
    });
  });
});
