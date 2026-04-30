import type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, LaneState, TicketSummary, TicketDetail, FileNode } from './types.js';

// Boards
export interface CreateBoardRequest { name: string; path?: string }
export interface PatchBoardRequest { name?: string; claudeContent?: string }
export interface DeleteBoardRequest { deleteFiles?: boolean }

// Lanes
export interface CreateLaneRequest { name: string; states: LaneState[] }
export interface PatchLaneRequest { name?: string; states?: LaneState[]; force?: boolean; processDoc?: string }
export interface DeleteLaneRequest { deleteFiles?: boolean }

// Tickets
export interface CreateTicketRequest { title: string; state: string; body?: string }
export interface PatchTicketRequest { title?: string; body?: string; state?: string; color?: string }
export interface ListTicketsResponse { tickets: TicketSummary[] }

// Files
export interface ListFilesResponse { files: FileNode[] }
export interface ReadFileResponse { content: string; path: string }
export interface WriteFileRequest { content: string }
export interface WriteFileResponse { ok: boolean; path: string }
export interface PatchFileRequest { content: string }
export interface PatchFileResponse { ok: boolean }

// Errors
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketSummary, TicketDetail, FileNode };
