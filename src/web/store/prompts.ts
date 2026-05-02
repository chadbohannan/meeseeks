import { create } from 'zustand';

interface PromptRunState {
  // Per-runtime accumulated plain-text output extracted from stream-json.
  outputs: Record<string, string>;
  // Modal visibility per runtimeId. Dismiss without killing the agent.
  modalOpen: Record<string, boolean>;
  // After the agent exits we keep the dock chip for ~3s before removing it.
  hidden: Record<string, true>;
  appendOutput: (id: string, chunk: string) => void;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  hide: (id: string) => void;
  reset: (id: string) => void;
}

export const usePromptsStore = create<PromptRunState>((set) => ({
  outputs: {},
  modalOpen: {},
  hidden: {},
  appendOutput: (id, chunk) => set((s) => ({
    outputs: { ...s.outputs, [id]: (s.outputs[id] ?? '') + chunk },
  })),
  openModal: (id) => set((s) => ({ modalOpen: { ...s.modalOpen, [id]: true } })),
  closeModal: (id) => set((s) => ({ modalOpen: { ...s.modalOpen, [id]: false } })),
  hide: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: true } })),
  reset: (id) => set((s) => {
    const o = { ...s.outputs }; delete o[id];
    const m = { ...s.modalOpen }; delete m[id];
    const h = { ...s.hidden }; delete h[id];
    return { outputs: o, modalOpen: m, hidden: h };
  }),
}));
