import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed(v: boolean): void;
}

export const useUi = create<UiState>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
}));
