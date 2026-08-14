import chokidar from 'chokidar';
import path from 'node:path';
import type { WorkspaceMeta } from '../shared/types.js';
import type { ChangeKind, WsEvent } from '../shared/events.js';
import type { WsHub } from './ws.js';
import { slugifyBoardPath, slugifyProjectPath } from '../storage/paths.js';
import { PROJECTS_DIR } from '../storage/project.js';

export interface WatcherHandle {
  cleanup(): Promise<void>;
}

interface PendingChange {
  type: 'board' | 'workflow' | 'ticket';
  payload: WsEvent['payload'];
  timer: NodeJS.Timeout;
  kind: ChangeKind;
}

const DEBOUNCE_MS = 50;

export function startWatcher(meta: WorkspaceMeta, hub: WsHub): WatcherHandle {
  const workspaceRoot = meta.path;
  const watcher = chokidar.watch(workspaceRoot, {
    ignored: ['**/node_modules/**', '**/.git/**', '**/.meeseeks/**', '**/.claude/**'],
    ignoreInitial: true,
    usePolling: true,
    interval: 2000,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
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
    const rel = path.relative(workspaceRoot, absPath);
    if (!rel || rel.startsWith('..')) return;
    const parts = rel.split(path.sep);

    // projects/<slug>.yaml — must be handled before the board fallthrough
    // below, which would otherwise read this as a board named 'projects'.
    if (parts[0] === PROJECTS_DIR) {
      if (parts.length !== 2) return;
      const filename = parts[1]!;
      if (!/\.ya?ml$/i.test(filename)) return;
      const projectId = slugifyProjectPath(filename);
      if (!projectId) return;
      emit(`project:${projectId}`, {
        type: 'project-changed',
        payload: { projectId, kind },
      });
      return;
    }

    const workflowsIdx = parts.indexOf('workflows');
    const promptsIdx = parts.indexOf('prompts');
    if (workflowsIdx === -1 && promptsIdx !== -1) {
      // <boardEntry>/prompts/<file>.md
      if (parts.length === promptsIdx + 2) {
        const boardEntry = parts.slice(0, promptsIdx).join('/');
        const boardId = slugifyBoardPath(boardEntry);
        const filename = parts[promptsIdx + 1]!;
        if (!boardId || !filename.endsWith('.md')) return;
        emit(`prompt:${boardId}:${filename}`, {
          type: 'prompts-changed',
          payload: { boardId, name: filename, kind },
        });
      }
      return;
    }
    if (workflowsIdx === -1) {
      // Skip top-level workspace config files (e.g. project.yaml itself).
      // Board-level changes need at least <boardEntry>/<file>.
      if (parts.length < 2) return;
      const boardEntry = parts.slice(0, parts.length - 1).join('/');
      const boardId = slugifyBoardPath(boardEntry);
      if (!boardId) return;
      emit(`board:${boardId}`, { type: 'board-changed', payload: { boardId, kind: 'updated' } });
      return;
    }
    const boardEntry = parts.slice(0, workflowsIdx).join('/');
    const boardId = slugifyBoardPath(boardEntry);
    if (parts.length === workflowsIdx + 2) {
      // <board>/workflows/<workflow>  -- workflow folder itself
      const workflowName = parts[workflowsIdx + 1]!;
      emit(`workflow:${boardId}:${workflowName}`, {
        type: 'workflow-changed', payload: { boardId, workflowName, kind },
      });
      return;
    }
    if (parts.length === workflowsIdx + 3) {
      // <board>/workflows/<workflow>/<file-or-state>
      const workflowName = parts[workflowsIdx + 1]!;
      const last = parts[workflowsIdx + 2]!;
      if (['workflow.yaml', 'PROCESS.md', 'permissions.yaml'].includes(last)) {
        emit(`workflow:${boardId}:${workflowName}`, {
          type: 'workflow-changed', payload: { boardId, workflowName, kind: 'updated' },
        });
      }
      return;
    }
    if (parts.length === workflowsIdx + 4) {
      // <board>/workflows/<workflow>/<state>/<file>.md
      const workflowName = parts[workflowsIdx + 1]!;
      const state = parts[workflowsIdx + 2]!;
      const filename = parts[workflowsIdx + 3]!;
      if (!filename.endsWith('.md')) return;
      emit(`ticket:${boardId}:${workflowName}:${filename}`, {
        type: 'ticket-changed',
        payload: { boardId, workflowName, filename, state, kind },
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
