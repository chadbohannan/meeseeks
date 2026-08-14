import chokidar from 'chokidar';
import path from 'node:path';
import type { WorkspaceMeta } from '../shared/types.js';
import type { ChangeKind, WsEvent } from '../shared/events.js';
import type { WsHub } from './ws.js';
import { slugifyWorkflowPath, slugifyProjectPath } from '../storage/paths.js';
import { PROJECTS_DIR } from '../storage/project.js';

export interface WatcherHandle {
  cleanup(): Promise<void>;
}

interface PendingChange {
  type: 'workflow' | 'ticket';
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

    // projects/<slug>.yaml
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

    // prompts/<file>.md
    if (parts[0] === 'prompts') {
      if (parts.length !== 2) return;
      const filename = parts[1]!;
      if (!filename.endsWith('.md')) return;
      emit(`prompt:${filename}`, {
        type: 'prompts-changed',
        payload: { name: filename, kind },
      });
      return;
    }

    // Everything below lives under workflows/. There is deliberately no
    // catch-all branch: the board-era fallthrough classified any
    // `<dir>/<file>` as a board change, which is what previously mistook
    // `projects/x.yaml` for a board and is now impossible to reintroduce.
    if (parts[0] !== 'workflows') return;

    const workflowName = parts[1] ? slugifyWorkflowPath(parts[1]) : '';
    if (!workflowName) return;

    if (parts.length === 2) {
      // workflows/<workflow> — the directory itself
      emit(`workflow:${workflowName}`, {
        type: 'workflow-changed', payload: { workflowName, kind },
      });
      return;
    }
    if (parts.length === 3) {
      // workflows/<workflow>/<file-or-state>
      const last = parts[2]!;
      if (['workflow.yaml', 'PROCESS.md', 'permissions.yaml'].includes(last)) {
        emit(`workflow:${workflowName}`, {
          type: 'workflow-changed', payload: { workflowName, kind: 'updated' },
        });
      }
      return;
    }
    if (parts.length === 4) {
      // workflows/<workflow>/<state>/<file>.md
      const state = parts[2]!;
      const filename = parts[3]!;
      if (!filename.endsWith('.md')) return;
      emit(`ticket:${workflowName}:${filename}`, {
        type: 'ticket-changed',
        payload: { workflowName, filename, state, kind },
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
