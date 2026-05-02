import { useRuntimesStore } from '../../store/runtimes.js';
import { useMdiStore } from '../../store/mdi.js';
import { usePromptsStore } from '../../store/prompts.js';
import { RuntimeStatusDot } from '../RuntimeStatusDot.js';

export function Dock() {
  const runtimes = useRuntimesStore((s) => s.byId);
  const panels = useMdiStore((s) => s.panels);
  const open = useMdiStore((s) => s.open);
  const focus = useMdiStore((s) => s.focus);
  const openModal = usePromptsStore((s) => s.openModal);
  const hidden = usePromptsStore((s) => s.hidden);

  const visible = Object.values(runtimes).filter(r => !hidden[r.runtimeId]);
  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto text-xs">
      {visible.map((r) => {
        const id = r.runtimeId;
        const inactive = r.status === 'exited' || r.status === 'errored' || r.status === 'terminating';
        if (r.kind === 'prompt') {
          const label = r.promptRef?.name ?? 'prompt';
          return (
            <button
              key={id}
              className={`flex items-center gap-2 rounded px-2 py-1 ${inactive ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-800 hover:bg-slate-700'}`}
              onClick={() => openModal(id)}
              title={`Prompt: ${label}`}
            >
              <RuntimeStatusDot status={r.status} />
              <span className="font-mono">{label}</span>
            </button>
          );
        }
        const inPanel = panels[id];
        const filename = r.ticketRef?.filename ?? id;
        return (
          <button
            key={id}
            className={`flex items-center gap-2 rounded px-2 py-1 ${inactive ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-800 hover:bg-slate-700'}`}
            onClick={() => { if (inPanel && !inPanel.minimized) focus(id); else open(id); }}
            title={`Ticket: ${filename}`}
          >
            <RuntimeStatusDot status={r.status} />
            <span className="font-mono">{filename}</span>
          </button>
        );
      })}
    </div>
  );
}
