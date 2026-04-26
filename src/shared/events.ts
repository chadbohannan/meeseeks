import type { ProjectMeta, BoardSummary } from './types.js';

export type ChangeKind = 'created' | 'updated' | 'deleted';

export type WsEvent =
  | { type: 'project-opened'; payload: { project: ProjectMeta; boards: BoardSummary[] } }
  | { type: 'project-closed'; payload: Record<string, never> }
  | { type: 'board-changed'; payload: { boardId: string; kind: ChangeKind } }
  | { type: 'lane-changed'; payload: { boardId: string; laneName: string; kind: ChangeKind } }
  | { type: 'ticket-changed'; payload: { boardId: string; laneName: string; filename: string; state: string; kind: ChangeKind } };
