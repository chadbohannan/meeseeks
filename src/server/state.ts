import type { WorkspaceMeta } from '../shared/types.js';
import { RuntimeSupervisor } from '../runtime/supervisor.js';

export interface OpenWorkspaceState {
  meta: WorkspaceMeta;
  watcherCleanup?: () => Promise<void>;
}

export class ServerState {
  private readonly _state: OpenWorkspaceState;
  readonly supervisor = new RuntimeSupervisor();

  constructor(meta: WorkspaceMeta, watcherCleanup?: () => Promise<void>) {
    this._state = { meta, watcherCleanup };
  }

  async shutdown(): Promise<void> {
    await this.supervisor.terminateAll();
    if (this._state.watcherCleanup) {
      await this._state.watcherCleanup();
    }
  }

  require(): OpenWorkspaceState { return this._state; }
  peek(): OpenWorkspaceState { return this._state; }
}
