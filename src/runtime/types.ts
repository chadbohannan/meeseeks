import type { RuntimeStatus, TicketRef, PromptRef, RuntimeSummary } from '../shared/runtime.js';
import type { PermissionsConfig, ResolvedPermissions, RuntimeConfig } from '../shared/types.js';

/** The project a runtime works on. Its root is added with --add-dir, not used as cwd. */
export interface SpawnProject {
  projectId: string;
  name: string;
  root: string;
  contextContent?: string | null;
}

export interface SpawnContext {
  runtimeId: string;
  /** `.claude/`, skills, bin, and CLAUDE.md all resolve from here. */
  workspaceRoot: string;
  /** cwd for the spawned process. */
  workflowPath: string;
  ticketAbsPath: string;
  processDocContent?: string | null;
  ticketRef: TicketRef;
  runtime: RuntimeConfig | null;
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
  workspaceRoot: string;
  promptRef: PromptRef;
  promptBody: string;
  /** From the picked workflow, if any; otherwise the workspace default. */
  runtime: RuntimeConfig | null;
  permissions: ResolvedPermissions | null;
  project?: SpawnProject | null;
  model?: string;
}

export type {
  RuntimeStatus, TicketRef, PromptRef, RuntimeSummary,
  PermissionsConfig, ResolvedPermissions, RuntimeConfig,
};
