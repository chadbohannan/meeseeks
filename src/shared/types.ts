export interface ModelOption {
  value: string;   // passed to claude-code --model (alias like 'opus' or a pinned id)
  label: string;   // shown in the picker
}

/**
 * How an agent is launched. Spawn parameters only — nothing here is
 * path-resolved, which is why this lives on the workflow rather than being
 * hoisted to the workspace alongside the cwd-bound `.claude/` directory.
 */
export interface RuntimeConfig {
  harness: string;
  provider: string;
  model: string;
  args: string[];
  env: Record<string, string>;
}

export interface WorkspaceConfig {
  name: string;
  workflows: string[];   // directory entries, e.g. 'workflows/development'
  projects: string[];    // config-file entries, e.g. 'projects/meeseeks.yaml'
  models?: ModelOption[];
  /** Default for workflows that define no `runtime:` of their own. */
  runtime?: RuntimeConfig;
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

/**
 * One proposal from inspecting a project root. `reason` and `evidence` are
 * required rather than decorative: they are what makes a proposal reviewable,
 * and a grant a user cannot see the basis for is one they cannot meaningfully
 * accept. `preselected` is the detector's recommendation, never a commitment —
 * nothing is written until the user accepts it.
 */
export interface Detection {
  kind: 'permission' | 'context' | 'runtime';
  value: string;
  reason: string;
  evidence: string;   // repo-relative path that justified it
  preselected: boolean;
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
  // Reported alongside the content so an editor can tell "this text is inline"
  // from "this text is a file's current contents" — saving the second as the
  // first would silently turn a live reference into a stale snapshot.
  contextFile: string | null;
  permissions: PermissionsConfig | null;
}

export interface WorkspaceMeta {
  path: string;          // absolute path to the workspace folder (containing project.yaml)
  config: WorkspaceConfig;
}

/**
 * A `workflows:` registry entry resolved against the workspace. Kept separate
 * from WorkflowSummary because resolving an entry only needs the filesystem —
 * reading a summary additionally parses workflow.yaml and counts tickets, which
 * a missing or malformed workflow cannot support.
 */
export interface WorkflowEntry {
  workflowName: string;  // slug derived from the registry entry's basename
  path: string;          // absolute
  available: boolean;    // false if the directory is missing on disk
}

export interface WorkflowState {
  dir: string;           // folder name on disk
  name: string;          // display name
}

export interface WorkflowSummary {
  workflowName: string;  // slug = registry entry basename = folder name
  displayName: string;   // user-facing name preserving original casing
  states: WorkflowState[];
  ticketCounts: Record<string, number>;  // by state.dir
  orphanedCount: number;
  available: boolean;    // false if registered but missing on disk
}

export interface WorkflowDetail extends WorkflowSummary {
  hasProcessDoc: boolean;
  hasPermissions: boolean;
  processDoc: string | null;
  /** Null when neither the workflow nor the workspace defines one. */
  runtime: RuntimeConfig | null;
  /** True when `runtime` came from the workspace default rather than this workflow. */
  runtimeInherited: boolean;
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
