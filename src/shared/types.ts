export interface ProjectConfig {
  name: string;
  boards: string[];
}

export interface ProjectMeta {
  path: string;          // absolute path to the project folder (containing project.meeseeks)
  config: ProjectConfig;
}

export interface BoardSummary {
  boardId: string;       // slug derived from project.meeseeks entry
  name: string;
  path: string;          // absolute
  available: boolean;    // false if folder is missing on disk
}

export interface BoardDetail extends BoardSummary {
  lanes: LaneSummary[];
  claudeContent?: string;
}

export interface LaneState {
  dir: string;           // folder name on disk
  name: string;          // display name
}

export interface LaneSummary {
  laneName: string;      // folder name = id (slug)
  displayName: string;   // user-facing name preserving original casing
  states: LaneState[];
  ticketCounts: Record<string, number>;  // by state.dir
  orphanedCount: number;
}

export interface LaneDetail extends LaneSummary {
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
  created: string;       // ISO
  updated: string;       // ISO
  orphaned: boolean;
}

export type TicketDetail = TicketSummary;

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
