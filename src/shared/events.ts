import type { RuntimeStatus, RuntimeSummary } from './runtime.js';

export type ChangeKind = 'created' | 'updated' | 'deleted';

export type WsEvent =
  | { type: 'workflow-changed'; payload: { workflowName: string; kind: ChangeKind } }
  | { type: 'ticket-changed'; payload: { workflowName: string; filename: string; state: string; kind: ChangeKind } }
  | { type: 'prompts-changed'; payload: { name: string; kind: ChangeKind } }
  | { type: 'project-changed'; payload: { projectId: string; kind: ChangeKind } }
  | { type: 'runtime-spawned'; payload: RuntimeSummary }
  | { type: 'runtime-status'; payload: { runtimeId: string; status: RuntimeStatus; exitCode?: number; errorMessage?: string } }
  | { type: 'runtime-stdio'; payload: { runtimeId: string; data: string } }
  | { type: 'runtime-message'; payload: { runtimeId: string; text: string } };

export type ClientWsMessage =
  | { type: 'runtime-input'; payload: { runtimeId: string; data: string } }
  | { type: 'runtime-resize'; payload: { runtimeId: string; cols: number; rows: number } };
