import { create } from 'zustand';

interface UiState {
  selectedLane: string | null;
  setSelectedLane(name: string | null): void;
}

export const useUi = create<UiState>((set) => ({
  selectedLane: null,
  setSelectedLane: (name) => set({ selectedLane: name }),
}));
