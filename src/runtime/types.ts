import type { RuntimeStatus, TicketRef, RuntimeSummary } from '../shared/runtime.js';

export interface BoardRuntimeConfig {
  runtime?: {
    harness?: string;
    provider?: string;
    model?: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface PermissionsConfig {
  allowedPaths: string[];
  allowedTools: string[];
  deniedTools: string[];
}

export interface SpawnContext {
  runtimeId: string;
  boardPath: string;
  lanePath: string;
  ticketAbsPath: string;
  processDocPath: string | null;
  ticketRef: TicketRef;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
}

export interface SettingsFile {
  path: string;
  body: string;
}

export interface SpawnSpec {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  preamble: string;
  settingsFile: SettingsFile | null;
}

export type { RuntimeStatus, TicketRef, RuntimeSummary };
