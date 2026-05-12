import type { RuntimeStatus, TicketRef, PromptRef, RuntimeSummary } from '../shared/runtime.js';

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
  boardContextContent?: string | null;
  processDocContent?: string | null;
  ticketRef: TicketRef;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
  model?: string;
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

export interface PromptSpawnContext {
  runtimeId: string;
  boardPath: string;
  promptRef: PromptRef;
  promptBody: string;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
  model?: string;
}

export type { RuntimeStatus, TicketRef, PromptRef, RuntimeSummary };
