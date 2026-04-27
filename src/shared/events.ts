import type { RuntimeStatus, RuntimeSummary } from './runtime.js';

export type ChangeKind = 'created' | 'updated' | 'deleted';

export type WsEvent =
  | { type: 'board-changed'; payload: { boardId: string; kind: ChangeKind } }
  | { type: 'lane-changed'; payload: { boardId: string; laneName: string; kind: ChangeKind } }
  | { type: 'ticket-changed'; payload: { boardId: string; laneName: string; filename: string; state: string; kind: ChangeKind } }
  | { type: 'runtime-spawned'; payload: RuntimeSummary }
  | { type: 'runtime-status'; payload: { runtimeId: string; status: RuntimeStatus; exitCode?: number; errorMessage?: string } }
  | { type: 'runtime-stdio'; payload: { runtimeId: string; data: string } };

export type ClientWsMessage =
  | { type: 'runtime-input'; payload: { runtimeId: string; data: string } }
  | { type: 'runtime-resize'; payload: { runtimeId: string; cols: number; rows: number } };
