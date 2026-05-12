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

interface UiState {
  collapsed: Record<string, boolean>;
  toggleCollapsed(key: string): void;
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
}));

export const boardCollapseKey = (boardId: string) => `board:${boardId}`;
export const laneCollapseKey = (boardId: string, laneName: string) =>
  `lane:${boardId}/${laneName}`;
