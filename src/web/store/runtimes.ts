import { create } from 'zustand';
import type { RuntimeSummary, RuntimeStatus } from '@shared/runtime.js';

interface RuntimesState {
  byId: Record<string, RuntimeSummary>;
  upsert: (s: RuntimeSummary) => void;
  setStatus: (id: string, status: RuntimeStatus, exitCode?: number, errorMessage?: string) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useRuntimesStore = create<RuntimesState>((set) => ({
  byId: {},
  upsert: (s) => set((st) => ({ byId: { ...st.byId, [s.runtimeId]: s } })),
  setStatus: (id, status, exitCode, errorMessage) => set((st) => {
    const cur = st.byId[id];
    if (!cur) return st;
    return { byId: { ...st.byId, [id]: { ...cur, status, exitCode, errorMessage } } };
  }),
  remove: (id) => set((st) => {
    const next = { ...st.byId };
    delete next[id];
    return { byId: next };
  }),
  reset: () => set({ byId: {} }),
}));
