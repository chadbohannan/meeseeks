import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { AppConfig } from '../../src/server/app-config.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function makeDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'meeseeks-cfg-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('AppConfig', () => {
  it('starts with empty recents', async () => {
    const dir = await makeDir();
    const cfg = new AppConfig(path.join(dir, 'recents.json'));
    expect(await cfg.listRecents()).toEqual([]);
  });

  it('records a recent and persists it', async () => {
    const dir = await makeDir();
    const file = path.join(dir, 'recents.json');
    const cfg = new AppConfig(file);
    await cfg.recordRecent('/some/path', 'My Proj');
    const list = await cfg.listRecents();
    expect(list).toHaveLength(1);
    expect(list[0]!.path).toBe('/some/path');
    expect(list[0]!.name).toBe('My Proj');
    const text = await readFile(file, 'utf8');
    expect(text).toContain('/some/path');
  });

  it('deduplicates and reorders by lastOpened', async () => {
    const dir = await makeDir();
    const cfg = new AppConfig(path.join(dir, 'recents.json'));
    await cfg.recordRecent('/a', 'A');
    await cfg.recordRecent('/b', 'B');
    await cfg.recordRecent('/a', 'A2');
    const list = await cfg.listRecents();
    expect(list.map(r => r.path)).toEqual(['/a', '/b']);
    expect(list[0]!.name).toBe('A2');
  });

  it('flags missing folders as unavailable', async () => {
    const dir = await makeDir();
    const cfg = new AppConfig(path.join(dir, 'recents.json'));
    await cfg.recordRecent('/definitely/not/here', 'x');
    const list = await cfg.listRecents();
    expect(list[0]!.available).toBe(false);
  });
});
