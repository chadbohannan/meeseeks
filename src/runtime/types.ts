import type { RuntimeStatus, TicketRef, PromptRef, RuntimeSummary } from '../shared/runtime.js';
import type { PermissionsConfig, ResolvedPermissions } from '../shared/types.js';

/** The project a runtime works on. Its root is added with --add-dir, not used as cwd. */
export interface SpawnProject {
  projectId: string;
  name: string;
  root: string;
  contextContent?: string | null;
}

export interface BoardRuntimeConfig {
  runtime?: {
    harness?: string;
    provider?: string;
    model?: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface SpawnContext {
  runtimeId: string;
  boardPath: string;
  workflowPath: string;
  ticketAbsPath: string;
  boardContextContent?: string | null;
  processDocContent?: string | null;
  ticketRef: TicketRef;
  board: BoardRuntimeConfig | null;
  permissions: ResolvedPermissions | null;
  project?: SpawnProject | null;
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
  permissions: ResolvedPermissions | null;
  project?: SpawnProject | null;
  model?: string;
}

export type { RuntimeStatus, TicketRef, PromptRef, RuntimeSummary, PermissionsConfig, ResolvedPermissions };
