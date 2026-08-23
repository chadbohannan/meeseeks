import type { WorkspaceMeta, WorkflowDetail, WorkflowState, TicketSummary, TicketDetail, FileNode, ModelOption, PermissionsConfig, ProjectSummary, ProjectDetail, Detection, RuntimeConfig, WorkflowSummary, ResolvedPermissions } from './types.js';

// Models
export interface ListModelsResponse { models: ModelOption[] }

// Projects
export interface CreateProjectRequest {
  name: string;
  root: string;
  /** Copy permissions and badge colour from this project id. */
  copyFrom?: string;
  color?: string;
  context?: string;
  contextFile?: string;
  permissions?: PermissionsConfig;
}
export interface PatchProjectRequest {
  name?: string;
  root?: string;
  color?: string;
  context?: string;
  contextFile?: string;
  permissions?: PermissionsConfig;
}
export interface DetectProjectRequest { root: string }
export interface DetectProjectResponse { detections: Detection[] }
export interface ListProjectsResponse { projects: ProjectSummary[] }
export interface GetProjectResponse { project: ProjectDetail }

// Workflows
/** `copyFrom` clones the named workflow's own runtime block and permissions. */
export interface CreateWorkflowRequest {
  name: string; states: WorkflowState[]; runtime?: RuntimeConfig; copyFrom?: string;
}
export interface PatchWorkflowRequest { name?: string; states?: WorkflowState[]; force?: boolean; processDoc?: string; runtime?: RuntimeConfig | null }
export interface DeleteWorkflowRequest { deleteFiles?: boolean }

// Tickets
export interface CreateTicketRequest { title: string; state: string; body?: string; project?: string }
export interface PatchTicketRequest { title?: string; body?: string; state?: string; color?: string; project?: string }
export interface ListTicketsResponse { tickets: TicketSummary[] }

// Files
export interface ListFilesResponse { files: FileNode[] }
export interface ReadFileResponse { content: string; path: string }
export interface WriteFileRequest { content: string }
export interface WriteFileResponse { ok: boolean; path: string }
export interface PatchFileRequest { content: string }
export interface PatchFileResponse { ok: boolean }

// Prompts
export interface PromptSummary { name: string; size: number; modified: string }
export interface PromptDetail { name: string; body: string }
export interface ListPromptsResponse { prompts: PromptSummary[] }
export interface GetPromptResponse { prompt: PromptDetail }
export interface PutPromptRequest { body: string }
export interface RunPromptRequest { model?: string; projectId?: string }
export interface PromptRunLog {
  runtimeId: string;
  startedAt: string;
  exitedAt: string;
  status: 'exited' | 'errored';
  errorMessage?: string;
  output: string;
}
export interface ListPromptLogsResponse { logs: PromptRunLog[] }

// Errors
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type { Detection, WorkspaceMeta, WorkflowDetail, TicketSummary, TicketDetail, FileNode, ProjectSummary, ProjectDetail, PermissionsConfig, RuntimeConfig, WorkflowSummary, ResolvedPermissions };
