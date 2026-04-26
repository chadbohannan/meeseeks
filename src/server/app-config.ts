import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { RecentEntry } from '../shared/types.js';

export function defaultRecentsPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'meeseeks', 'recents.json');
}

interface StoredRecent {
  path: string;
  name: string;
  lastOpened: string;
}

export class AppConfig {
  constructor(private readonly file: string = defaultRecentsPath()) {}

  private async loadStored(): Promise<StoredRecent[]> {
    try {
      const text = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(text) as { recents?: unknown };
      if (!parsed || !Array.isArray(parsed.recents)) return [];
      return parsed.recents.filter((r): r is StoredRecent =>
        typeof r === 'object' && r !== null
        && typeof (r as StoredRecent).path === 'string'
        && typeof (r as StoredRecent).name === 'string'
        && typeof (r as StoredRecent).lastOpened === 'string'
      );
    } catch {
      return [];
    }
  }

  private async save(items: StoredRecent[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ recents: items }, null, 2), 'utf8');
  }

  async recordRecent(projectPath: string, name: string): Promise<void> {
    const items = await this.loadStored();
    const filtered = items.filter(r => r.path !== projectPath);
    filtered.unshift({ path: projectPath, name, lastOpened: new Date().toISOString() });
    await this.save(filtered.slice(0, 50));
  }

  async listRecents(): Promise<RecentEntry[]> {
    const items = await this.loadStored();
    const out: RecentEntry[] = [];
    for (const r of items) {
      let available = false;
      try { available = (await stat(r.path)).isDirectory(); } catch { available = false; }
      out.push({ ...r, available });
    }
    return out;
  }
}
