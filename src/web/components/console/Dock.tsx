import { useRuntimesStore } from '../../store/runtimes.js';
import { useMdiStore } from '../../store/mdi.js';
import { RuntimeStatusDot } from '../RuntimeStatusDot.js';

export function Dock() {
  const runtimes = useRuntimesStore((s) => s.byId);
  const panels = useMdiStore((s) => s.panels);
  const open = useMdiStore((s) => s.open);
  const focus = useMdiStore((s) => s.focus);
  const ids = Object.keys(runtimes);
  if (ids.length === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 overflow-x-auto bg-slate-900 px-3 py-1 text-xs border-t border-slate-700">
      {ids.map((id) => {
        const r = runtimes[id]!;
        const inPanel = panels[id];
        return (
          <button
            key={id}
            className="flex items-center gap-2 rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
            onClick={() => { if (inPanel && !inPanel.minimized) focus(id); else open(id); }}
          >
            <RuntimeStatusDot status={r.status} />
            <span className="font-mono">{r.ticketRef.filename}</span>
          </button>
        );
      })}
    </div>
  );
}
