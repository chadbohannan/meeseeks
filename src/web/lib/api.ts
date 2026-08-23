import type {
  CreateWorkflowRequest, PatchWorkflowRequest, DeleteWorkflowRequest,
  CreateTicketRequest, PatchTicketRequest, ListTicketsResponse,
  ApiErrorBody,
  WorkspaceMeta, WorkflowSummary, WorkflowDetail, TicketDetail,
  ListFilesResponse, ReadFileResponse, WriteFileRequest, WriteFileResponse,
  PatchFileRequest, PatchFileResponse, FileNode,
  ListPromptsResponse, GetPromptResponse, PutPromptRequest, ListPromptLogsResponse,
  ListModelsResponse,
  CreateProjectRequest, PatchProjectRequest, ListProjectsResponse, GetProjectResponse,
  DetectProjectResponse,
  ProjectSummary, ResolvedPermissions,
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
  // Workspace
  workspace: () => request<{ workspace: WorkspaceMeta | null; workflows: WorkflowSummary[] }>('GET', '/api/workspace'),

  // Models
  listModels: () => request<ListModelsResponse>('GET', '/api/models'),

  // Projects
  listProjects: () => request<ListProjectsResponse>('GET', '/api/projects'),
  getProject: (id: string) => request<GetProjectResponse>('GET', `/api/projects/${enc(id)}`),
  createProject: (req: CreateProjectRequest) =>
    request<{ project: ProjectSummary }>('POST', '/api/projects', req),
  patchProject: (id: string, req: PatchProjectRequest) =>
    request<GetProjectResponse>('PATCH', `/api/projects/${enc(id)}`, req),
  deleteProject: (id: string) => request<{ ok: boolean }>('DELETE', `/api/projects/${enc(id)}`),
  detectProject: (root: string) =>
    request<DetectProjectResponse>('POST', '/api/projects/detect', { root }),
  ticketPermissions: (workflowName: string, filename: string) =>
    request<{ projectId: string | null; projectResolved: boolean; permissions: ResolvedPermissions | null }>(
      'GET', `/api/tickets/${enc(workflowName)}/${enc(filename)}/permissions`),

  // Workflows
  listWorkflows: () => request<{ workflows: WorkflowSummary[] }>('GET', '/api/workflows'),
  createWorkflow: (req: CreateWorkflowRequest) =>
    request<{ workflow: WorkflowDetail }>('POST', '/api/workflows', req),
  getWorkflow: (workflowName: string) =>
    request<{ workflow: WorkflowDetail }>('GET', `/api/workflows/${enc(workflowName)}`),
  patchWorkflow: (workflowName: string, req: PatchWorkflowRequest) =>
    request<{ workflow: WorkflowDetail }>('PATCH', `/api/workflows/${enc(workflowName)}`, req),
  deleteWorkflow: (workflowName: string, req: DeleteWorkflowRequest) =>
    request<{ ok: true }>('DELETE', `/api/workflows/${enc(workflowName)}`, req),

  // Tickets
  listTickets: (workflowName: string) =>
    request<ListTicketsResponse>('GET', `/api/workflows/${enc(workflowName)}/tickets`),
  createTicket: (workflowName: string, req: CreateTicketRequest) =>
    request<{ ticket: TicketDetail }>('POST', `/api/workflows/${enc(workflowName)}/tickets`, req),
  getTicket: (workflowName: string, filename: string) =>
    request<{ ticket: TicketDetail }>('GET', `/api/workflows/${enc(workflowName)}/tickets/${enc(filename)}`),
  patchTicket: (workflowName: string, filename: string, req: PatchTicketRequest) =>
    request<{ ticket: TicketDetail }>('PATCH', `/api/workflows/${enc(workflowName)}/tickets/${enc(filename)}`, req),
  deleteTicket: (workflowName: string, filename: string) =>
    request<{ ok: true }>('DELETE', `/api/workflows/${enc(workflowName)}/tickets/${enc(filename)}`),

  // Runtimes
  listRuntimes: () => request<ListRuntimesResponse>('GET', '/api/runtimes'),
  getRuntime: (id: string) => request<{ runtime: RuntimeSummary }>('GET', `/api/runtimes/${enc(id)}`),
  getRuntimeSnapshot: (id: string) => request<{ data: string }>('GET', `/api/runtimes/${enc(id)}/snapshot`),
  spawnRuntime: (workflowName: string, filename: string, model?: string) =>
    request<SpawnRuntimeResponse>('POST', `/api/tickets/${enc(workflowName)}/${enc(filename)}/runtime`, model ? { model } : undefined),
  terminateRuntime: (id: string) => request<Record<string, never>>('DELETE', `/api/runtimes/${enc(id)}`),

  // Files
  listFiles: (namespace: string) =>
    request<ListFilesResponse>('GET', `/api/files/${enc(namespace)}`),
  readFile: (namespace: string, filepath: string) =>
    request<ReadFileResponse>('GET', `/api/files/${enc(namespace)}/${enc(filepath)}`),
  createFile: (namespace: string, filepath: string, req: WriteFileRequest) =>
    request<WriteFileResponse>('POST', `/api/files/${enc(namespace)}/${enc(filepath)}`, req),
  patchFile: (namespace: string, filepath: string, req: PatchFileRequest) =>
    request<PatchFileResponse>('PATCH', `/api/files/${enc(namespace)}/${enc(filepath)}`, req),
  deleteFile: (namespace: string, filepath: string) =>
    request<{ ok: boolean }>('DELETE', `/api/files/${enc(namespace)}/${enc(filepath)}`),

  // Prompts
  listPrompts: () => request<ListPromptsResponse>('GET', '/api/prompts'),
  getPrompt: (name: string) =>
    request<GetPromptResponse>('GET', `/api/prompts/${enc(name)}`),
  putPrompt: (name: string, req: PutPromptRequest) =>
    request<GetPromptResponse>('PUT', `/api/prompts/${enc(name)}`, req),
  deletePrompt: (name: string) =>
    request<{ ok: boolean }>('DELETE', `/api/prompts/${enc(name)}`),
  runPrompt: (name: string, opts?: { model?: string; projectId?: string; workflowName?: string }) => {
    const body: Record<string, string> = {};
    if (opts?.model) body.model = opts.model;
    if (opts?.projectId) body.projectId = opts.projectId;
    if (opts?.workflowName) body.workflowName = opts.workflowName;
    return request<SpawnRuntimeResponse>(
      'POST',
      `/api/prompts/${enc(name)}/run`,
      Object.keys(body).length > 0 ? body : undefined,
    );
  },
  getPromptLogs: (name: string) =>
    request<ListPromptLogsResponse>('GET', `/api/prompts/${enc(name)}/logs`),
};
