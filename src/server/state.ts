import type { ProjectMeta } from '../shared/types.js';
import { ProjectNotOpenError } from '../storage/errors.js';

export interface OpenProjectState {
  meta: ProjectMeta;
  watcherCleanup?: () => Promise<void>;
}

export class ServerState {
  private current: OpenProjectState | null = null;

  open(meta: ProjectMeta, watcherCleanup?: () => Promise<void>): void {
    this.current = { meta, watcherCleanup };
  }

  async close(): Promise<void> {
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
