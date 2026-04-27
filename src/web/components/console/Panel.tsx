import { useRef } from 'react';
import { useMdiStore } from '../../store/mdi.js';
import { useRuntimesStore } from '../../store/runtimes.js';
import { useTerminateRuntime } from '../../hooks/queries.js';
import { XtermHost } from './xterm-host.js';
import { RuntimeStatusDot } from '../RuntimeStatusDot.js';

export function Panel({ runtimeId }: { runtimeId: string }) {
  const panel = useMdiStore((s) => s.panels[runtimeId]);
  const runtime = useRuntimesStore((s) => s.byId[runtimeId]);
  const close = useMdiStore((s) => s.close);
  const setMinimized = useMdiStore((s) => s.setMinimized);
  const focus = useMdiStore((s) => s.focus);
  const move = useMdiStore((s) => s.move);
  const term = useTerminateRuntime();
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  if (!panel || panel.minimized || !runtime) return null;

  const onMouseDown = (e: React.MouseEvent) => {
    focus(runtimeId);
    dragRef.current = { dx: e.clientX - panel.x, dy: e.clientY - panel.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      move(runtimeId, ev.clientX - dragRef.current.dx, ev.clientY - dragRef.current.dy);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onTerminate = async () => {
    if (!confirm('Terminate this runtime?')) return;
    await term.mutateAsync(runtimeId);
  };

  return (
    <div
      className="fixed flex flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
      style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h, zIndex: panel.z }}
      onMouseDown={() => focus(runtimeId)}
    >
      <div
        className="flex select-none items-center justify-between bg-slate-800 px-3 py-1 text-sm rounded-t-lg cursor-move"
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2">
          <RuntimeStatusDot status={runtime.status} />
          <span className="font-mono text-xs">{runtime.ticketRef.filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-slate-300 hover:text-white" onClick={() => setMinimized(runtimeId, true)}>—</button>
          <button className="text-xs text-red-400 hover:text-red-300" onClick={onTerminate}>×</button>
          <button className="text-xs text-slate-300 hover:text-white" onClick={() => close(runtimeId)}>close</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-black p-2">
        <XtermHost runtimeId={runtimeId} />
      </div>
    </div>
  );
}
