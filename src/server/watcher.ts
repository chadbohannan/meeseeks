import chokidar from 'chokidar';
import path from 'node:path';
import type { ProjectMeta } from '../shared/types.js';
import type { ChangeKind, WsEvent } from '../shared/events.js';
import type { WsHub } from './ws.js';
import { slugifyBoardPath } from '../storage/paths.js';

export interface WatcherHandle {
  cleanup(): Promise<void>;
}

interface PendingChange {
  type: 'board' | 'lane' | 'ticket';
  payload: WsEvent['payload'];
  timer: NodeJS.Timeout;
  kind: ChangeKind;
}

const DEBOUNCE_MS = 50;

export function startWatcher(meta: ProjectMeta, hub: WsHub): WatcherHandle {
  const projectRoot = meta.path;
  const watcher = chokidar.watch(projectRoot, {
    ignored: ['**/node_modules/**', '**/.git/**', '**/.meeseeks/**'],
    ignoreInitial: true,
    usePolling: true,
    interval: 500,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const pending = new Map<string, PendingChange>();

  function emit(key: string, event: WsEvent): void {
    const existing = pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pending.delete(key);
      hub.broadcast(event);
    }, DEBOUNCE_MS);
    pending.set(key, { type: 'ticket', payload: event.payload, timer, kind: 'updated' });
  }

  function handle(absPath: string, kind: ChangeKind): void {
    const rel = path.relative(projectRoot, absPath);
    if (!rel || rel.startsWith('..')) return;
    const parts = rel.split(path.sep);
    const lanesIdx = parts.indexOf('lanes');
    if (lanesIdx === -1) {
      // Skip top-level project files (e.g. project.meeseeks itself).
      // Board-level changes need at least <boardEntry>/<file>.
      if (parts.length < 2) return;
      const boardEntry = parts.slice(0, parts.length - 1).join('/');
      const boardId = slugifyBoardPath(boardEntry);
      if (!boardId) return;
      emit(`board:${boardId}`, { type: 'board-changed', payload: { boardId, kind: 'updated' } });
      return;
    }
    const boardEntry = parts.slice(0, lanesIdx).join('/');
    const boardId = slugifyBoardPath(boardEntry);
    if (parts.length === lanesIdx + 2) {
      // <board>/lanes/<lane>  -- lane folder itself
      const laneName = parts[lanesIdx + 1]!;
      emit(`lane:${boardId}:${laneName}`, {
        type: 'lane-changed', payload: { boardId, laneName, kind },
      });
      return;
    }
    if (parts.length === lanesIdx + 3) {
      // <board>/lanes/<lane>/<file-or-state>
      const laneName = parts[lanesIdx + 1]!;
      const last = parts[lanesIdx + 2]!;
      if (['lane.yaml', 'PROCESS.md', 'permissions.yaml'].includes(last)) {
        emit(`lane:${boardId}:${laneName}`, {
          type: 'lane-changed', payload: { boardId, laneName, kind: 'updated' },
        });
      }
      return;
    }
    if (parts.length === lanesIdx + 4) {
      // <board>/lanes/<lane>/<state>/<file>.md
      const laneName = parts[lanesIdx + 1]!;
      const state = parts[lanesIdx + 2]!;
      const filename = parts[lanesIdx + 3]!;
      if (!filename.endsWith('.md')) return;
      emit(`ticket:${boardId}:${laneName}:${filename}`, {
        type: 'ticket-changed',
        payload: { boardId, laneName, filename, state, kind },
      });
    }
  }

  watcher.on('add', p => handle(p, 'created'));
  watcher.on('change', p => handle(p, 'updated'));
  watcher.on('unlink', p => handle(p, 'deleted'));
  watcher.on('addDir', p => handle(p, 'created'));
  watcher.on('unlinkDir', p => handle(p, 'deleted'));

  return {
    async cleanup() {
      for (const v of pending.values()) clearTimeout(v.timer);
      pending.clear();
      await watcher.close();
    },
  };
}
