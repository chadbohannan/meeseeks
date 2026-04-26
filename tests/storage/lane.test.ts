import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import {
  createLane, listLanes, readLaneDetail, renameLane, updateLaneStates, deleteLaneFolder,
} from '../../src/storage/lane.js';
import { createBoard } from '../../src/storage/board.js';
import { ConflictError, NotFoundError, InvalidLaneError } from '../../src/storage/errors.js';
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

describe('createLane', () => {
  it('creates folder, lane.yaml, state subfolders', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const lanePath = path.join(boardPath, 'lanes/work');
    expect(await exists(path.join(lanePath, 'lane.yaml'))).toBe(true);
    expect(await exists(path.join(lanePath, 'PROCESS.md'))).toBe(true);
    expect(await exists(path.join(lanePath, 'permissions.yaml'))).toBe(true);
    for (const s of STATES) {
      expect(await exists(path.join(lanePath, s.dir))).toBe(true);
    }
    const yaml = await readFile(path.join(lanePath, 'lane.yaml'), 'utf8');
    expect(yaml).toContain('todo');
  });

  it('rejects duplicate lane name', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await expect(createLane(boardPath, 'work', STATES)).rejects.toThrow(ConflictError);
  });
});

describe('listLanes / readLaneDetail', () => {
  it('lists lanes with empty ticket counts', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const lanes = await listLanes(boardPath);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.ticketCounts).toEqual({ todo: 0, doing: 0, done: 0 });
  });

  it('throws InvalidLaneError when lane.yaml missing', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(boardPath, 'lanes/work/lane.yaml'));
    await expect(readLaneDetail(boardPath, 'work')).rejects.toThrow(InvalidLaneError);
  });

  it('auto-creates state folders missing on disk but listed in lane.yaml', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(boardPath, 'lanes/work/doing'), { recursive: true });
    await readLaneDetail(boardPath, 'work');  // auto-creates
    expect(await exists(path.join(boardPath, 'lanes/work/doing'))).toBe(true);
  });
});

describe('updateLaneStates', () => {
  it('adds a new state folder', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await updateLaneStates(boardPath, 'work', [...STATES, { dir: 'review', name: 'Review' }]);
    expect(await exists(path.join(boardPath, 'lanes/work/review'))).toBe(true);
  });

  it('rejects removal of a state folder containing tickets unless force=true', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await writeYaml(path.join(boardPath, 'lanes/work/doing/2026-04-26T1430-x.md'), '---\ntitle: x\n---\n');
    await expect(
      updateLaneStates(boardPath, 'work', STATES.filter(s => s.dir !== 'doing')),
    ).rejects.toThrow(ConflictError);
  });
});

describe('renameLane', () => {
  it('renames folder', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await renameLane(boardPath, 'work', 'engineering');
    expect(await exists(path.join(boardPath, 'lanes/engineering'))).toBe(true);
    expect(await exists(path.join(boardPath, 'lanes/work'))).toBe(false);
  });
});

describe('deleteLaneFolder', () => {
  it('removes lane', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await deleteLaneFolder(boardPath, 'work');
    expect(await exists(path.join(boardPath, 'lanes/work'))).toBe(false);
  });

  it('throws NotFoundError on missing lane', async () => {
    const { boardPath } = await setupBoard();
    await expect(deleteLaneFolder(boardPath, 'nope')).rejects.toThrow(NotFoundError);
  });
});
