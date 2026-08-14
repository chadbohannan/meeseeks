import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import {
  createWorkflow, listWorkflows, readWorkflowDetail, renameWorkflow, updateWorkflowStates, deleteWorkflowFolder,
} from '../../src/storage/workflow.js';
import { createBoard } from '../../src/storage/board.js';
import { ConflictError, NotFoundError, InvalidWorkflowError } from '../../src/storage/errors.js';
import { makeBareProject, writeYaml } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

const STATES = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'doing', name: 'Doing' },
  { dir: 'done', name: 'Done' },
];

async function setupBoard() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const boardPath = path.join(tp.root, 'boards/b');
  await createBoard(boardPath, 'B');
  return { tp, boardPath };
}

describe('createWorkflow', () => {
  it('creates folder, workflow.yaml, state subfolders', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    const workflowPath = path.join(boardPath, 'workflows/work');
    expect(await exists(path.join(workflowPath, 'workflow.yaml'))).toBe(true);
    expect(await exists(path.join(workflowPath, 'PROCESS.md'))).toBe(true);
    expect(await exists(path.join(workflowPath, 'permissions.yaml'))).toBe(true);
    for (const s of STATES) {
      expect(await exists(path.join(workflowPath, s.dir))).toBe(true);
    }
    const yaml = await readFile(path.join(workflowPath, 'workflow.yaml'), 'utf8');
    expect(yaml).toContain('todo');
  });

  it('generates a PROCESS.md with one section per state', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    const process = await readFile(path.join(boardPath, 'workflows/work/PROCESS.md'), 'utf8');
    expect(process).toContain('work Process');
    for (const s of STATES) {
      expect(process).toContain(`## ${s.name}`);
    }
  });

  it('rejects duplicate workflow name', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    await expect(createWorkflow(boardPath, 'work', STATES)).rejects.toThrow(ConflictError);
  });
});

describe('listWorkflows / readWorkflowDetail', () => {
  it('lists workflows with empty ticket counts', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    const workflows = await listWorkflows(boardPath);
    const work = workflows.find(l => l.workflowName === 'work');
    expect(work).toBeDefined();
    expect(work!.ticketCounts).toEqual({ todo: 0, doing: 0, done: 0 });
  });

  it('throws InvalidWorkflowError when workflow.yaml missing', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(boardPath, 'workflows/work/workflow.yaml'));
    await expect(readWorkflowDetail(boardPath, 'work')).rejects.toThrow(InvalidWorkflowError);
  });

  it('auto-creates state folders missing on disk but listed in workflow.yaml', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(boardPath, 'workflows/work/doing'), { recursive: true });
    await readWorkflowDetail(boardPath, 'work');  // auto-creates
    expect(await exists(path.join(boardPath, 'workflows/work/doing'))).toBe(true);
  });
});

describe('updateWorkflowStates', () => {
  it('adds a new state folder', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    await updateWorkflowStates(boardPath, 'work', [...STATES, { dir: 'review', name: 'Review' }]);
    expect(await exists(path.join(boardPath, 'workflows/work/review'))).toBe(true);
  });

  it('rejects removal of a state folder containing tickets unless force=true', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    await writeYaml(path.join(boardPath, 'workflows/work/doing/2026-04-26T1430-x.md'), '---\ntitle: x\n---\n');
    await expect(
      updateWorkflowStates(boardPath, 'work', STATES.filter(s => s.dir !== 'doing')),
    ).rejects.toThrow(ConflictError);
  });
});

describe('renameWorkflow', () => {
  it('renames folder', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    await renameWorkflow(boardPath, 'work', 'engineering');
    expect(await exists(path.join(boardPath, 'workflows/engineering'))).toBe(true);
    expect(await exists(path.join(boardPath, 'workflows/work'))).toBe(false);
  });
});

describe('deleteWorkflowFolder', () => {
  it('removes workflow', async () => {
    const { boardPath } = await setupBoard();
    await createWorkflow(boardPath, 'work', STATES);
    await deleteWorkflowFolder(boardPath, 'work');
    expect(await exists(path.join(boardPath, 'workflows/work'))).toBe(false);
  });

  it('throws NotFoundError on missing workflow', async () => {
    const { boardPath } = await setupBoard();
    await expect(deleteWorkflowFolder(boardPath, 'nope')).rejects.toThrow(NotFoundError);
  });
});
