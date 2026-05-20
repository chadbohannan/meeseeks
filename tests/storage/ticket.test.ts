import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import {
  createTicket, listTickets, readTicket, updateTicket, deleteTicket,
} from '../../src/storage/ticket.js';
import { createBoard } from '../../src/storage/board.js';
import { createLane } from '../../src/storage/lane.js';
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
  await createLane(boardPath, 'work', STATES);
  return { boardPath, lanePath: path.join(boardPath, 'lanes/work') };
}

describe('createTicket', () => {
  it('creates a markdown file with frontmatter in the state folder', async () => {
    const { boardPath } = await setup();
    const t = await createTicket(boardPath, 'work', { title: 'Fix login', state: 'todo', body: 'Body text' });
    expect(t.title).toBe('Fix login');
    expect(t.state).toBe('todo');
    expect(t.filename.endsWith('.md')).toBe(true);
    const filePath = path.join(boardPath, 'lanes/work/todo', t.filename);
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
    const { boardPath, lanePath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'real title', state: 'todo' });
    // Simulate an external agent rewriting frontmatter: drops title, adds status
    await writeFile(
      path.join(lanePath, 'todo', c.filename),
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
});

describe('updateTicket', () => {
  it('updates title and body without moving', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'old' });
    const u = await updateTicket(boardPath, 'work', c.filename, { title: 'new', body: 'new body' });
    expect(u.title).toBe('new');
    const text = await readFile(path.join(boardPath, 'lanes/work/todo', c.filename), 'utf8');
    expect(text).toContain('new body');
  });

  it('preserves unknown frontmatter fields across updates', async () => {
    const { boardPath, lanePath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'old' });
    const filePath = path.join(lanePath, 'todo', c.filename);
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
    expect(await exists(path.join(boardPath, 'lanes/work/todo', c.filename))).toBe(false);
    expect(await exists(path.join(boardPath, 'lanes/work/doing', c.filename))).toBe(true);
  });
});

describe('deleteTicket', () => {
  it('removes the file', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'x', state: 'todo' });
    await deleteTicket(boardPath, 'work', c.filename);
    expect(await exists(path.join(boardPath, 'lanes/work/todo', c.filename))).toBe(false);
  });
});
