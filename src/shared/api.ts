import type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, LaneState, TicketSummary, TicketDetail, RecentEntry } from './types.js';

// Projects
export interface OpenProjectRequest { path: string }
export interface OpenProjectResponse { project: ProjectMeta; boards: BoardSummary[] }
export interface CreateProjectRequest { path: string; name: string }
export interface ListRecentsResponse { recents: RecentEntry[] }

// Boards
export interface CreateBoardRequest { name: string; path?: string }
export interface PatchBoardRequest { name?: string }
export interface DeleteBoardRequest { deleteFiles?: boolean }

// Lanes
export interface CreateLaneRequest { name: string; states: LaneState[] }
export interface PatchLaneRequest { name?: string; states?: LaneState[]; force?: boolean }
export interface DeleteLaneRequest { deleteFiles?: boolean }

// Tickets
export interface CreateTicketRequest { title: string; state: string; body?: string }
export interface PatchTicketRequest { title?: string; body?: string; state?: string }
export interface ListTicketsResponse { tickets: TicketSummary[] }

// Errors
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketSummary, TicketDetail, RecentEntry };
