import { create } from 'zustand';

const STORAGE_KEY = 'meeseeks:sidebar-collapsed';

function load(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / disabled storage
  }
}

const FILTER_KEY = 'meeseeks:project-filter';
const LAST_PROJECT_KEY = 'meeseeks:last-project';

/** Sentinel filter values. Real values are project ids. */
export const PROJECT_FILTER_ALL = '__all__';
export const PROJECT_FILTER_UNASSIGNED = '__unassigned__';

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

interface UiState {
  collapsed: Record<string, boolean>;
  toggleCollapsed(key: string): void;
  /** Project filter per workflow, so a filter survives navigation. */
  projectFilter: Record<string, string>;
  setProjectFilter(workflowName: string, value: string): void;
  /** Last project explicitly chosen anywhere; seeds the new-ticket default. */
  lastProject: string | null;
  setLastProject(projectId: string | null): void;
}

export const useUi = create<UiState>((set) => ({
  collapsed: load(),
  toggleCollapsed: (key) =>
    set((s) => {
      const next = { ...s.collapsed };
      if (next[key]) delete next[key];
      else next[key] = true;
      save(next);
      return { collapsed: next };
    }),

  projectFilter: loadJson<Record<string, string>>(FILTER_KEY, {}),
  setProjectFilter: (workflowName, value) =>
    set((s) => {
      const next = { ...s.projectFilter };
      if (value === PROJECT_FILTER_ALL) delete next[workflowName];
      else next[workflowName] = value;
      saveJson(FILTER_KEY, next);
      return { projectFilter: next };
    }),

  lastProject: loadJson<string | null>(LAST_PROJECT_KEY, null),
  setLastProject: (projectId) =>
    set(() => {
      saveJson(LAST_PROJECT_KEY, projectId);
      return { lastProject: projectId };
    }),
}));

// Persisted keys from the board era ('workflow:<boardId>/<name>') simply do not
// match these, which fails safe: an unmatched collapse key reads as expanded and
// an unmatched filter key reads as "All".
export const workflowCollapseKey = (workflowName: string) => `workflow:${workflowName}`;
