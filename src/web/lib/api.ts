import type {
  CreateBoardRequest, PatchBoardRequest, DeleteBoardRequest,
  CreateLaneRequest, PatchLaneRequest, DeleteLaneRequest,
  CreateTicketRequest, PatchTicketRequest, ListTicketsResponse,
  ApiErrorBody,
  ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketDetail,
  ListFilesResponse, ReadFileResponse, WriteFileRequest, WriteFileResponse,
  PatchFileRequest, PatchFileResponse, FileNode,
  ListPromptsResponse, GetPromptResponse, PutPromptRequest, ListPromptLogsResponse,
  ListModelsResponse,
} from '@shared/api.js';
import type { ListRuntimesResponse, SpawnRuntimeResponse, RuntimeSummary } from '@shared/runtime.js';

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
  current: () => request<{ project: ProjectMeta | null }>('GET', '/api/projects/current'),

  // Models
  listModels: () => request<ListModelsResponse>('GET', '/api/models'),

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
    request<{ lane: LaneDetail }>('PATCH', `/api/boards/${enc(boardId)}/lanes/${enc(laneName)}`, req),
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

  // Runtimes
  listRuntimes: () => request<ListRuntimesResponse>('GET', '/api/runtimes'),
  getRuntime: (id: string) => request<{ runtime: RuntimeSummary }>('GET', `/api/runtimes/${enc(id)}`),
  getRuntimeSnapshot: (id: string) => request<{ data: string }>('GET', `/api/runtimes/${enc(id)}/snapshot`),
  spawnRuntime: (boardId: string, laneName: string, filename: string, model?: string) =>
    request<SpawnRuntimeResponse>('POST', `/api/tickets/${enc(boardId)}/${enc(laneName)}/${enc(filename)}/runtime`, model ? { model } : undefined),
  terminateRuntime: (id: string) => request<Record<string, never>>('DELETE', `/api/runtimes/${enc(id)}`),

  // Files
  listFiles: (boardId: string, namespace: string) =>
    request<ListFilesResponse>('GET', `/api/boards/${enc(boardId)}/files/${enc(namespace)}`),
  readFile: (boardId: string, namespace: string, filepath: string) =>
    request<ReadFileResponse>('GET', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`),
  createFile: (boardId: string, namespace: string, filepath: string, req: WriteFileRequest) =>
    request<WriteFileResponse>('POST', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`, req),
  patchFile: (boardId: string, namespace: string, filepath: string, req: PatchFileRequest) =>
    request<PatchFileResponse>('PATCH', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`, req),
  deleteFile: (boardId: string, namespace: string, filepath: string) =>
    request<{ ok: boolean }>('DELETE', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`),

  // Prompts
  listPrompts: (boardId: string) =>
    request<ListPromptsResponse>('GET', `/api/boards/${enc(boardId)}/prompts`),
  getPrompt: (boardId: string, name: string) =>
    request<GetPromptResponse>('GET', `/api/boards/${enc(boardId)}/prompts/${enc(name)}`),
  putPrompt: (boardId: string, name: string, req: PutPromptRequest) =>
    request<GetPromptResponse>('PUT', `/api/boards/${enc(boardId)}/prompts/${enc(name)}`, req),
  deletePrompt: (boardId: string, name: string) =>
    request<{ ok: boolean }>('DELETE', `/api/boards/${enc(boardId)}/prompts/${enc(name)}`),
  runPrompt: (boardId: string, name: string, model?: string) =>
    request<SpawnRuntimeResponse>('POST', `/api/boards/${enc(boardId)}/prompts/${enc(name)}/run`, model ? { model } : undefined),
  getPromptLogs: (boardId: string, name: string) =>
    request<ListPromptLogsResponse>('GET', `/api/boards/${enc(boardId)}/prompts/${enc(name)}/logs`),
};
