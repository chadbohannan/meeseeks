export interface ModelOption {
  value: string;   // passed to claude-code --model (alias like 'opus' or a pinned id)
  label: string;   // shown in the picker
}

export interface WorkspaceConfig {
  name: string;
  boards: string[];
  projects: string[];    // config-file entries, e.g. 'projects/meeseeks.yaml'
  models?: ModelOption[];
}

/**
 * Agent permissions. Lives here rather than in runtime/ because storage owns
 * reading these from workflow and project configs, and may not import from runtime.
 */
export interface PermissionsConfig {
  allowedPaths: string[];
  allowedTools: string[];
  deniedTools: string[];
}

export type PermissionOrigin = 'project' | 'workflow';

/**
 * One effective permission entry plus the config files that contributed it.
 * Provenance is retained rather than discarded so the console can attribute
 * every effective rule back to the file it came from.
 */
export interface ResolvedPermissionEntry {
  value: string;
  origins: PermissionOrigin[];
}

/**
 * Project and workflow permissions unioned. Deny beats allow inside Claude Code
 * itself, so either source can enforce a floor the other cannot undo.
 * `allowedPaths` values are absolute — each source resolves its own relative
 * entries against its own base before the union.
 */
export interface ResolvedPermissions {
  allowedPaths: ResolvedPermissionEntry[];
  allowedTools: ResolvedPermissionEntry[];
  deniedTools: ResolvedPermissionEntry[];
}

/** A selectable codebase configuration, decoupled from any board. */
export interface ProjectConfig {
  name: string;
  root: string;          // absolute path to the codebase; may live outside the workspace
  color?: string;        // drives the ticket card badge
  context?: string;      // inline project context
  contextFile?: string;  // path to a context doc, relative to the config file's directory
  permissions?: PermissionsConfig;
}

export interface ProjectSummary {
  projectId: string;     // slug derived from the config filename
  name: string;
  root: string;          // absolute, tilde-expanded
  color?: string;
  available: boolean;    // false if root is missing or is not a directory
}

export interface ProjectDetail extends ProjectSummary {
  configPath: string;    // absolute path to the project's yaml file
  contextContent: string | null;
  permissions: PermissionsConfig | null;
}

export interface WorkspaceMeta {
  path: string;          // absolute path to the workspace folder (containing project.yaml)
  config: WorkspaceConfig;
}

export interface BoardSummary {
  boardId: string;       // slug derived from the workspace config's boards[] entry
  name: string;
  path: string;          // absolute
  available: boolean;    // false if folder is missing on disk
}

export interface BoardDetail extends BoardSummary {
  workflows: WorkflowSummary[];
  contextContent?: string;
}

export interface WorkflowState {
  dir: string;           // folder name on disk
  name: string;          // display name
}

export interface WorkflowSummary {
  workflowName: string;      // folder name = id (slug)
  displayName: string;   // user-facing name preserving original casing
  states: WorkflowState[];
  ticketCounts: Record<string, number>;  // by state.dir
  orphanedCount: number;
}

export interface WorkflowDetail extends WorkflowSummary {
  hasProcessDoc: boolean;
  hasPermissions: boolean;
  processDoc: string | null;
}

export interface TicketSummary {
  filename: string;
  state: string;         // state.dir, or '__orphaned__' for tickets in unknown folders
  title: string;
  body: string;
  color?: string;        // hex color for border/accent, stored in front-matter
  project?: string;      // projectId; absent means unassigned (cannot start a runtime)
  created: string;       // ISO
  updated: string;       // ISO
  orphaned: boolean;
}

export interface TicketDetail extends TicketSummary {
  absPath: string;
}

export interface FileNode {
  name: string;
  isDirectory: boolean;
  size?: number;
  modified?: string; // ISO timestamp
}

export interface RecentEntry {
  path: string;
  name: string;
  lastOpened: string;    // ISO
  available: boolean;    // checked at list-time
}
