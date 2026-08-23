import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
} from '../../src/storage/project.js';
import { readWorkspace } from '../../src/storage/workspace.js';
import { NotFoundError, InvalidInputError, ConflictError } from '../../src/storage/errors.js';
import { makeBareProject, writeYaml } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function workspace() {
  const tp = await makeBareProject('WS');
  cleanups.push(tp.cleanup);
  return tp.root;
}

/** A real directory to point a project's root at. */
async function repoDir(root: string, name = 'repo') {
  const p = path.join(root, name);
  await mkdir(p, { recursive: true });
  return p;
}

describe('createProject', () => {
  it('writes projects/<slug>.yaml and registers it in the workspace', async () => {
    const root = await workspace();
    const repo = await repoDir(root);

    const project = await createProject(root, { name: 'My Project', root: repo });
    expect(project.projectId).toBe('my-project');
    expect(project.name).toBe('My Project');
    expect(project.root).toBe(repo);
    expect(project.available).toBe(true);

    const meta = await readWorkspace(root);
    expect(meta.config.projects).toEqual(['projects/my-project.yaml']);

    const text = await readFile(path.join(root, 'projects/my-project.yaml'), 'utf8');
    expect(yaml.load(text)).toEqual({
      name: 'My Project',
      root: repo,
      permissions: { allowedPaths: [], allowedTools: [`Read(${repo}/**)`], deniedTools: [] },
    });
  });

  it('writes a long root on one line instead of folding it', async () => {
    const root = await workspace();
    // Long enough to trip yaml.dump's default line wrapping, which would emit
    // a `>-` block scalar. These configs are hand-edited, so that must not happen.
    const deep = await repoDir(root, `${'nested-'.repeat(12)}repo`);
    await createProject(root, { name: 'Deep', root: deep });

    const text = await readFile(path.join(root, 'projects/deep.yaml'), 'utf8');
    expect(text).toContain(`root: ${deep}`);
    expect(text).not.toContain('>-');
    expect((await getProject(root, 'deep')).root).toBe(deep);
  });

  it('rejects a missing name or root', async () => {
    const root = await workspace();
    await expect(createProject(root, { name: '', root: '/tmp' })).rejects.toThrow(InvalidInputError);
    await expect(createProject(root, { name: 'x', root: '' })).rejects.toThrow(InvalidInputError);
  });

  it('rejects a duplicate config filename', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, { name: 'Dup', root: repo });
    await expect(createProject(root, { name: 'Dup', root: repo })).rejects.toThrow(ConflictError);
  });

  it('expands a leading ~ in root', async () => {
    const root = await workspace();
    const project = await createProject(root, { name: 'Home', root: '~/some-dir' });
    expect(project.root).toBe(path.join(os.homedir(), 'some-dir'));
  });
});

describe('listProjects', () => {
  it('returns empty initially', async () => {
    expect(await listProjects(await workspace())).toEqual([]);
  });

  it('flags a missing root as unavailable', async () => {
    const root = await workspace();
    const project = await createProject(root, { name: 'Gone', root: path.join(root, 'nope') });
    expect(project.available).toBe(false);
    const [listed] = await listProjects(root);
    expect(listed!.available).toBe(false);
  });

  it('flags a root that exists but is a file as unavailable', async () => {
    const root = await workspace();
    const filePath = path.join(root, 'a-file');
    await writeFile(filePath, 'x', 'utf8');
    const project = await createProject(root, { name: 'File', root: filePath });
    expect(project.available).toBe(false);
  });

  it('surfaces a registered entry with a missing config file as unavailable', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, { name: 'Ghost', root: repo });
    await rm(path.join(root, 'projects/ghost.yaml'));

    const listed = await listProjects(root);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.projectId).toBe('ghost');
    expect(listed[0]!.available).toBe(false);
  });

  it('suffixes ids when two entries share a basename', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await writeYaml(path.join(root, 'projects/dup.yaml'), `name: A\nroot: ${repo}\n`);
    await writeYaml(path.join(root, 'nested/dup.yaml'), `name: B\nroot: ${repo}\n`);
    await writeYaml(
      path.join(root, 'workspace.yaml'),
      `name: WS\nboards: []\nprojects:\n  - projects/dup.yaml\n  - nested/dup.yaml\n`,
    );

    const listed = await listProjects(root);
    expect(listed.map(p => p.projectId)).toEqual(['dup', 'dup-1']);
    expect(listed.map(p => p.name)).toEqual(['A', 'B']);
  });
});

describe('getProject', () => {
  it('throws NotFoundError for an unknown id', async () => {
    await expect(getProject(await workspace(), 'nope')).rejects.toThrow(NotFoundError);
  });

  it('returns inline context and permissions', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, {
      name: 'Ctx',
      root: repo,
      context: 'read the wiki first',
      permissions: { allowedPaths: ['~/libs'], allowedTools: ['Read'], deniedTools: ['Bash'] },
    });

    const detail = await getProject(root, 'ctx');
    expect(detail.contextContent).toBe('read the wiki first');
    expect(detail.permissions).toEqual({
      allowedPaths: ['~/libs'], allowedTools: ['Read'], deniedTools: ['Bash'],
    });
  });

  it('reads contextFile relative to the config directory', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await writeYaml(
      path.join(root, 'projects/withfile.yaml'),
      `name: WithFile\nroot: ${repo}\ncontextFile: CONTEXT.md\n`,
    );
    await writeFile(path.join(root, 'projects/CONTEXT.md'), 'from a file', 'utf8');
    await writeYaml(
      path.join(root, 'workspace.yaml'),
      `name: WS\nboards: []\nprojects:\n  - projects/withfile.yaml\n`,
    );

    expect((await getProject(root, 'withfile')).contextContent).toBe('from a file');
  });

  it('returns null context and permissions when unset', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    // Written directly rather than through createProject, which seeds the
    // starter permission set.
    await writeYaml(path.join(root, 'projects/bare.yaml'), `name: Bare\nroot: ${repo}\n`);
    await writeYaml(
      path.join(root, 'workspace.yaml'),
      `name: WS\nprojects:\n  - projects/bare.yaml\n`,
    );
    const detail = await getProject(root, 'bare');
    expect(detail.contextContent).toBeNull();
    expect(detail.permissions).toBeNull();
  });

  it('treats an all-empty permissions block as unset', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await writeYaml(
      path.join(root, 'projects/empty.yaml'),
      `name: Empty\nroot: ${repo}\npermissions:\n  allowedPaths: []\n  allowedTools: []\n  deniedTools: []\n`,
    );
    await writeYaml(
      path.join(root, 'workspace.yaml'),
      `name: WS\nboards: []\nprojects:\n  - projects/empty.yaml\n`,
    );
    expect((await getProject(root, 'empty')).permissions).toBeNull();
  });
});

describe('updateProject', () => {
  it('patches fields in place without changing the projectId', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    const other = await repoDir(root, 'other');
    await createProject(root, { name: 'Original', root: repo });

    const updated = await updateProject(root, 'original', { name: 'Renamed', root: other });
    // The id is derived from the filename, which deliberately does not follow a
    // rename — tickets reference the id.
    expect(updated.projectId).toBe('original');
    expect(updated.name).toBe('Renamed');
    expect(updated.root).toBe(other);

    const meta = await readWorkspace(root);
    expect(meta.config.projects).toEqual(['projects/original.yaml']);
    expect((await getProject(root, 'original')).name).toBe('Renamed');
  });

  it('rejects an empty name and an unknown id', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, { name: 'P', root: repo });
    await expect(updateProject(root, 'p', { name: '  ' })).rejects.toThrow(InvalidInputError);
    await expect(updateProject(root, 'nope', { name: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('leaves unpatched fields untouched', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, { name: 'Keep', root: repo, color: '#abc', context: 'ctx' });
    const updated = await updateProject(root, 'keep', { name: 'Kept' });
    expect(updated.color).toBe('#abc');
    expect(updated.contextContent).toBe('ctx');
    expect(updated.root).toBe(repo);
  });
});

describe('deleteProject', () => {
  it('unregisters the entry and removes the config file', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, { name: 'Doomed', root: repo });

    await deleteProject(root, 'doomed');
    expect(await listProjects(root)).toEqual([]);
    expect((await readWorkspace(root)).config.projects).toEqual([]);
    await expect(readFile(path.join(root, 'projects/doomed.yaml'), 'utf8')).rejects.toThrow();
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(deleteProject(await workspace(), 'nope')).rejects.toThrow(NotFoundError);
  });
});

describe('contextFile', () => {
  // The repo's own CLAUDE.md is outside the workspace by definition, and the
  // harness does not read it on its own: cwd is the workspace root, and the
  // project root is only an --add-dir.
  it('resolves an absolute context file living outside the workspace', async () => {
    const root = await workspace();
    const repo = await repoDir(root, 'outside-repo');
    const doc = path.join(repo, 'CLAUDE.md');
    await writeYaml(doc, '# how this codebase works');

    await createProject(root, { name: 'Ctx', root: repo, contextFile: doc });
    const detail = await getProject(root, 'ctx');
    expect(detail.contextFile).toBe(doc);
    expect(detail.contextContent).toBe('# how this codebase works');
  });

  it('reports a missing context file as no content rather than throwing', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    await createProject(root, { name: 'Gone', root: repo, contextFile: path.join(repo, 'NOPE.md') });
    const detail = await getProject(root, 'gone');
    expect(detail.contextContent).toBeNull();
  });

  it('lets a patch swap between inline context and a context file', async () => {
    const root = await workspace();
    const repo = await repoDir(root);
    const doc = path.join(repo, 'AGENTS.md');
    await writeYaml(doc, 'from the file');

    await createProject(root, { name: 'Swap', root: repo, context: 'typed by hand' });
    expect((await getProject(root, 'swap')).contextContent).toBe('typed by hand');

    // Inline context wins while it is set, so switching to a file must clear it.
    await updateProject(root, 'swap', { context: '', contextFile: doc });
    const onFile = await getProject(root, 'swap');
    expect(onFile.contextFile).toBe(doc);
    expect(onFile.contextContent).toBe('from the file');

    await updateProject(root, 'swap', { contextFile: '', context: 'typed again' });
    const inline = await getProject(root, 'swap');
    expect(inline.contextFile).toBeNull();
    expect(inline.contextContent).toBe('typed again');
  });
});
