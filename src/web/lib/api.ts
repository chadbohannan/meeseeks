import type {
  OpenProjectRequest, OpenProjectResponse, CreateProjectRequest, ListRecentsResponse,
  CreateBoardRequest, PatchBoardRequest, DeleteBoardRequest,
  CreateLaneRequest, PatchLaneRequest, DeleteLaneRequest,
  CreateTicketRequest, PatchTicketRequest, ListTicketsResponse,
  ApiErrorBody,
  ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketDetail,
} from '@shared/api.js';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code = 'UNKNOWN', message = `HTTP ${res.status}`;
    try {
      const data = await res.json() as ApiErrorBody;
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch { /* non-JSON body */ }
    throw new ApiError(code, message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  // Projects
  recents: () => request<ListRecentsResponse>('GET', '/api/projects/recent'),
  current: () => request<{ project: ProjectMeta | null }>('GET', '/api/projects/current'),
  open: (req: OpenProjectRequest) => request<OpenProjectResponse>('POST', '/api/projects/open', req),
  close: () => request<{ ok: true }>('POST', '/api/projects/close'),
  createProject: (req: CreateProjectRequest) => request<OpenProjectResponse>('POST', '/api/projects/create', req),

  // Boards
  listBoards: () => request<{ boards: BoardSummary[] }>('GET', '/api/boards'),
  createBoard: (req: CreateBoardRequest) => request<{ board: BoardSummary }>('POST', '/api/boards', req),
  getBoard: (id: string) => request<{ board: BoardDetail }>('GET', `/api/boards/${enc(id)}`),
  patchBoard: (id: string, req: PatchBoardRequest) => request<{ ok: true }>('PATCH', `/api/boards/${enc(id)}`, req),
  deleteBoard: (id: string, req: DeleteBoardRequest) => request<{ ok: true }>('DELETE', `/api/boards/${enc(id)}`, req),

  // Lanes
  createLane: (boardId: string, req: CreateLaneRequest) =>
    request<{ lane: LaneDetail }>('POST', `/api/boards/${enc(boardId)}/lanes`, req),
  getLane: (boardId: string, laneName: string) =>
    request<{ lane: LaneDetail }>('GET', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}`),
  patchLane: (boardId: string, laneName: string, req: PatchLaneRequest) =>
    request<{ ok: true }>('PATCH', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}`, req),
  deleteLane: (boardId: string, laneName: string, req: DeleteLaneRequest) =>
    request<{ ok: true }>('DELETE', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}`, req),

  // Tickets
  listTickets: (boardId: string, laneName: string) =>
    request<ListTicketsResponse>('GET', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}/tickets`),
  createTicket: (boardId: string, laneName: string, req: CreateTicketRequest) =>
    request<{ ticket: TicketDetail }>('POST', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}/tickets`, req),
  getTicket: (boardId: string, laneName: string, filename: string) =>
    request<{ ticket: TicketDetail }>('GET', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}/tickets/${enc(filename)}`),
  patchTicket: (boardId: string, laneName: string, filename: string, req: PatchTicketRequest) =>
    request<{ ticket: TicketDetail }>('PATCH', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}/tickets/${enc(filename)}`, req),
  deleteTicket: (boardId: string, laneName: string, filename: string) =>
    request<{ ok: true }>('DELETE', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}/tickets/${enc(filename)}`),
};
