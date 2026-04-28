export type RuntimeStatus =
  | 'starting'
  | 'running'
  | 'idle'
  | 'terminating'
  | 'exited'
  | 'errored';

export interface TicketRef {
  boardId: string;
  laneName: string;
  filename: string;
}

export interface RuntimeSummary {
  runtimeId: string;
  ticketRef: TicketRef;
  pid: number | null;
  status: RuntimeStatus;
  startedAt: string;
  exitCode?: number;
  errorMessage?: string;
  preamble: string;
}

export interface ListRuntimesResponse { runtimes: RuntimeSummary[] }
export interface SpawnRuntimeResponse { runtime: RuntimeSummary }
