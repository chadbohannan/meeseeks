import type { ProjectMeta } from '../shared/types.js';
import { RuntimeSupervisor } from '../runtime/supervisor.js';

export interface OpenProjectState {
  meta: ProjectMeta;
  watcherCleanup?: () => Promise<void>;
}

export class ServerState {
  private readonly _state: OpenProjectState;
  readonly supervisor = new RuntimeSupervisor();

  constructor(meta: ProjectMeta, watcherCleanup?: () => Promise<void>) {
    this._state = { meta, watcherCleanup };
  }

  async shutdown(): Promise<void> {
    await this.supervisor.terminateAll();
    if (this._state.watcherCleanup) {
      await this._state.watcherCleanup();
    }
  }

  require(): OpenProjectState { return this._state; }
  peek(): OpenProjectState { return this._state; }
}
