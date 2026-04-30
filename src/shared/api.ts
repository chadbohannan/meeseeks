import type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, LaneState, TicketSummary, TicketDetail } from './types.js';

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

// Errors
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketSummary, TicketDetail };
