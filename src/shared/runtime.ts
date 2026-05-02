export type RuntimeStatus =
  | 'starting'
  | 'running'
  | 'idle'
  | 'awaiting-user'
  | 'terminating'
  | 'exited'
  | 'errored';

export interface TicketRef {
  boardId: string;
  laneName: string;
  filename: string;
}

export interface PromptRef {
  boardId: string;
  name: string;
}

export type RuntimeKind = 'ticket' | 'prompt';

export interface RuntimeSummary {
  runtimeId: string;
  kind: RuntimeKind;
  ticketRef?: TicketRef;     // present when kind === 'ticket'
  promptRef?: PromptRef;     // present when kind === 'prompt'
  pid: number | null;
  status: RuntimeStatus;
  startedAt: string;
  exitCode?: number;
  errorMessage?: string;
  preamble: string;
  lastMessage?: string;      // last assistant text, populated for prompt agents
}

export interface ListRuntimesResponse { runtimes: RuntimeSummary[] }
export interface SpawnRuntimeResponse { runtime: RuntimeSummary }
