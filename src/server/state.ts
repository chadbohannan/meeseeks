import type { ProjectMeta } from '../shared/types.js';
import { ProjectNotOpenError } from '../storage/errors.js';
import { RuntimeSupervisor } from '../runtime/supervisor.js';

export interface OpenProjectState {
  meta: ProjectMeta;
  watcherCleanup?: () => Promise<void>;
}

export class ServerState {
  private current: OpenProjectState | null = null;
  readonly supervisor = new RuntimeSupervisor();

  open(meta: ProjectMeta, watcherCleanup?: () => Promise<void>): void {
    this.current = { meta, watcherCleanup };
  }

  async close(): Promise<void> {
    await this.supervisor.terminateAll();
    if (this.current?.watcherCleanup) {
      await this.current.watcherCleanup();
    }
    this.current = null;
  }

  isOpen(): boolean { return this.current !== null; }

  require(): OpenProjectState {
    if (!this.current) throw new ProjectNotOpenError();
    return this.current;
  }

  peek(): OpenProjectState | null { return this.current; }
}
