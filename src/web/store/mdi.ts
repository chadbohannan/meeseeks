import { create } from 'zustand';

export interface PanelState {
  runtimeId: string;
  minimized: boolean;
  z: number;
  x: number; y: number; w: number; h: number;
}

interface MdiState {
  panels: Record<string, PanelState>;
  open: (runtimeId: string) => void;
  close: (runtimeId: string) => void;
  setMinimized: (runtimeId: string, minimized: boolean) => void;
  focus: (runtimeId: string) => void;
  move: (runtimeId: string, x: number, y: number) => void;
  resize: (runtimeId: string, w: number, h: number) => void;
}

let zCounter = 1;

export const useMdiStore = create<MdiState>((set) => ({
  panels: {},
  open: (runtimeId) => set((st) => {
    if (st.panels[runtimeId]) {
      return { panels: { ...st.panels, [runtimeId]: { ...st.panels[runtimeId], minimized: false, z: ++zCounter } } };
    }
    const idx = Object.keys(st.panels).length;
    return {
      panels: {
        ...st.panels,
        [runtimeId]: {
          runtimeId, minimized: false, z: ++zCounter,
          x: 80 + 30 * idx, y: 80 + 30 * idx, w: 720, h: 420,
        },
      },
    };
  }),
  close: (runtimeId) => set((st) => {
    const p = { ...st.panels }; delete p[runtimeId]; return { panels: p };
  }),
  setMinimized: (runtimeId, minimized) => set((st) => {
    const cur = st.panels[runtimeId];
    if (!cur) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...cur, minimized } } };
  }),
  focus: (runtimeId) => set((st) => {
    const cur = st.panels[runtimeId];
    if (!cur) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...cur, minimized: false, z: ++zCounter } } };
  }),
  move: (runtimeId, x, y) => set((st) => {
    const cur = st.panels[runtimeId];
    if (!cur) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...cur, x, y } } };
  }),
  resize: (runtimeId, w, h) => set((st) => {
    const cur = st.panels[runtimeId];
    if (!cur) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...cur, w, h } } };
  }),
}));
