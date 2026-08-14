import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import {
  createTicket, listTickets, readTicket, updateTicket, deleteTicket,
} from '../../src/storage/ticket.js';
import { createBoard } from '../../src/storage/board.js';
import { createWorkflow } from '../../src/storage/workflow.js';
import { NotFoundError, InvalidInputError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

const STATES = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'doing', name: 'Doing' },
  { dir: 'done', name: 'Done' },
];

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const boardPath = path.join(tp.root, 'boards/b');
  await createBoard(boardPath, 'B');
  await createWorkflow(boardPath, 'work', STATES);
  return { boardPath, workflowPath: path.join(boardPath, 'workflows/work') };
}

describe('createTicket', () => {
  it('creates a markdown file with frontmatter in the state folder', async () => {
    const { boardPath } = await setup();
    const t = await createTicket(boardPath, 'work', { title: 'Fix login', state: 'todo', body: 'Body text' });
    expect(t.title).toBe('Fix login');
    expect(t.state).toBe('todo');
    expect(t.filename.endsWith('.md')).toBe(true);
    const filePath = path.join(boardPath, 'workflows/work/todo', t.filename);
    const text = await readFile(filePath, 'utf8');
    expect(text).toContain('title: Fix login');
    expect(text).toContain('Body text');
  });

  it('rejects unknown state', async () => {
    const { boardPath } = await setup();
    await expect(createTicket(boardPath, 'work', { title: 'x', state: 'nope' })).rejects.toThrow(InvalidInputError);
  });
});

describe('listTickets', () => {
  it('lists tickets across all states', async () => {
    const { boardPath } = await setup();
    await createTicket(boardPath, 'work', { title: 'a', state: 'todo' });
    await createTicket(boardPath, 'work', { title: 'b', state: 'doing' });
    const list = await listTickets(boardPath, 'work');
    expect(list).toHaveLength(2);
  });

  it('treats folder placement as authoritative regardless of frontmatter', async () => {
    const { boardPath, workflowPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'real title', state: 'todo' });
    // Simulate an external agent rewriting frontmatter: drops title, adds status
    await writeFile(
      path.join(workflowPath, 'todo', c.filename),
      '---\nstatus: in-progress\n---\nbody\n',
      'utf8',
    );
    const list = await listTickets(boardPath, 'work');
    expect(list).toHaveLength(1);
    expect(list[0]?.state).toBe('todo');
    expect(list[0]?.orphaned).toBe(false);
  });
});

describe('readTicket', () => {
  it('returns parsed ticket', async () => {
    const { boardPath } = await setup();
    const created = await createTicket(boardPath, 'work', { title: 'x', state: 'todo', body: 'hi' });
    const t = await readTicket(boardPath, 'work', created.filename);
    expect(t.title).toBe('x');
    expect(t.body.trim()).toBe('hi');
  });

  it('throws NotFoundError for missing file', async () => {
    const { boardPath } = await setup();
    await expect(readTicket(boardPath, 'work', '2026-01-01T0000-nope.md')).rejects.toThrow(NotFoundError);
  });

  it('falls back gracefully when frontmatter is invalid YAML', async () => {
    const { boardPath, workflowPath } = await setup();
    const filename = '2026-06-08T0000-broken.md';
    // `title: [unterminated` is invalid YAML — gray-matter throws, exercising parse()'s catch path.
    await writeFile(
      path.join(workflowPath, 'todo', filename),
      '---\ntitle: [unterminated\n---\nthe body survives\n',
      'utf8',
    );
    const read = await readTicket(boardPath, 'work', filename);
    expect(read.title).toBe('broken');                 // derived from filename
    expect(read.body).toContain('the body survives');
    // updateTicket reads the fallback frontmatter then re-serializes — must not throw,
    // and must preserve the body. Relies on the fallback having a well-formed `extra`.
    const updated = await updateTicket(boardPath, 'work', filename, { title: 'fixed' });
    expect(updated.title).toBe('fixed');
    const text = await readFile(path.join(workflowPath, 'todo', filename), 'utf8');
    expect(text).toContain('the body survives');
  });
});

describe('updateTicket', () => {
  it('updates title and body without moving', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'old' });
    const u = await updateTicket(boardPath, 'work', c.filename, { title: 'new', body: 'new body' });
    expect(u.title).toBe('new');
    const text = await readFile(path.join(boardPath, 'workflows/work/todo', c.filename), 'utf8');
    expect(text).toContain('new body');
  });

  it('preserves unknown frontmatter fields across updates', async () => {
    const { boardPath, workflowPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'old' });
    const filePath = path.join(workflowPath, 'todo', c.filename);
    await writeFile(
      filePath,
      '---\ntitle: orig\ncreated: \'2026-01-01T00:00:00.000Z\'\nupdated: \'2026-01-01T00:00:00.000Z\'\njira: https://example.com/JIRA-1\njira_status: In Progress\nassignee: bohannan\npriority: High\n---\nold\n',
      'utf8',
    );
    await updateTicket(boardPath, 'work', c.filename, { body: 'new body' });
    const text = await readFile(filePath, 'utf8');
    expect(text).toMatch(/jira: ['"]?https:\/\/example\.com\/JIRA-1['"]?/);
    expect(text).toContain('jira_status: In Progress');
    expect(text).toContain('assignee: bohannan');
    expect(text).toContain('priority: High');
    expect(text).toContain('new body');
  });

  it('moves the file when state changes', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'x', state: 'todo' });
    const moved = await updateTicket(boardPath, 'work', c.filename, { state: 'doing' });
    expect(moved.state).toBe('doing');
    expect(await exists(path.join(boardPath, 'workflows/work/todo', c.filename))).toBe(false);
    expect(await exists(path.join(boardPath, 'workflows/work/doing', c.filename))).toBe(true);
  });

  it('is a no-op when nothing changed: leaves updated and file bytes untouched', async () => {
    const { boardPath, workflowPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'body' });
    // A client loads the ticket, then echoes the loaded values back (the spurious
    // save path). readTicket returns the normalized body, matching what's on disk.
    const loaded = await readTicket(boardPath, 'work', c.filename);
    const filePath = path.join(workflowPath, 'todo', c.filename);
    const before = await readFile(filePath, 'utf8');
    const u = await updateTicket(boardPath, 'work', c.filename, {
      title: loaded.title, body: loaded.body, state: loaded.state,
    });
    expect(u.updated).toBe(loaded.updated);
    const after = await readFile(filePath, 'utf8');
    expect(after).toBe(before);
  });

  it('bumps updated when content actually changes', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'body' });
    const u = await updateTicket(boardPath, 'work', c.filename, { body: 'changed' });
    expect(u.updated).not.toBe(c.updated);
  });
});

describe('deleteTicket', () => {
  it('removes the file', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'x', state: 'todo' });
    await deleteTicket(boardPath, 'work', c.filename);
    expect(await exists(path.join(boardPath, 'workflows/work/todo', c.filename))).toBe(false);
  });
});

describe('ticket project frontmatter', () => {
  it('round-trips a project through create, read, and list', async () => {
    const { boardPath } = await setup();
    const created = await createTicket(boardPath, 'work', {
      title: 'Fix auth', state: 'todo', project: 'meeseeks',
    });
    expect(created.project).toBe('meeseeks');

    const text = await readFile(path.join(boardPath, 'workflows/work/todo', created.filename), 'utf8');
    expect(text).toContain('project: meeseeks');

    expect((await readTicket(boardPath, 'work', created.filename)).project).toBe('meeseeks');
    const listed = await listTickets(boardPath, 'work');
    expect(listed.find(t => t.filename === created.filename)!.project).toBe('meeseeks');
  });

  it('leaves project undefined when unassigned and writes no key', async () => {
    const { boardPath } = await setup();
    const created = await createTicket(boardPath, 'work', { title: 'No project', state: 'todo' });
    expect(created.project).toBeUndefined();
    const text = await readFile(path.join(boardPath, 'workflows/work/todo', created.filename), 'utf8');
    expect(text).not.toContain('project:');
  });

  it('assigns, reassigns, and clears via updateTicket', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'T', state: 'todo' });

    expect((await updateTicket(boardPath, 'work', c.filename, { project: 'alpha' })).project).toBe('alpha');
    expect((await updateTicket(boardPath, 'work', c.filename, { project: 'beta' })).project).toBe('beta');

    // An empty string clears the assignment; undefined would leave it alone.
    expect((await updateTicket(boardPath, 'work', c.filename, { project: '' })).project).toBeUndefined();
    const text = await readFile(path.join(boardPath, 'workflows/work/todo', c.filename), 'utf8');
    expect(text).not.toContain('project:');
  });

  it('preserves project across an unrelated patch and a state move', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'T', state: 'todo', project: 'keep-me' });

    expect((await updateTicket(boardPath, 'work', c.filename, { title: 'Renamed' })).project).toBe('keep-me');
    const moved = await updateTicket(boardPath, 'work', c.filename, { state: 'doing' });
    expect(moved.project).toBe('keep-me');
    expect(moved.state).toBe('doing');
  });

  it('preserves unrelated frontmatter keys alongside project', async () => {
    const { boardPath, workflowPath } = await setup();
    const filePath = path.join(workflowPath, 'todo', 'custom.md');
    await writeFile(
      filePath,
      '---\ntitle: Custom\ncreated: 2026-08-12T00:00:00Z\nupdated: 2026-08-12T00:00:00Z\nproject: alpha\nsprint: 42\n---\nbody',
      'utf8',
    );
    const updated = await updateTicket(boardPath, 'work', 'custom.md', { title: 'Custom 2' });
    expect(updated.project).toBe('alpha');
    const text = await readFile(filePath, 'utf8');
    expect(text).toContain('sprint: 42');
    expect(text).toContain('project: alpha');
  });

  it('treats an empty project value on disk as unassigned', async () => {
    const { boardPath, workflowPath } = await setup();
    await writeFile(
      path.join(workflowPath, 'todo', 'blank.md'),
      '---\ntitle: Blank\ncreated: 2026-08-12T00:00:00Z\nupdated: 2026-08-12T00:00:00Z\nproject: ""\n---\nbody',
      'utf8',
    );
    expect((await readTicket(boardPath, 'work', 'blank.md')).project).toBeUndefined();
  });
});
