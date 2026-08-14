import { useState } from 'react';
import type { WorkflowState } from '@shared/types.js';

interface StatesEditorProps {
  states: WorkflowState[];
  ticketCounts?: Record<string, number>;
  onUpdate: (idx: number, field: keyof WorkflowState, value: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
}

export function StatesEditor({ states, ticketCounts, onUpdate, onAdd, onRemove, onMove }: StatesEditorProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  return (
    <>
      <div className="flex items-center gap-2 px-1 mb-1 text-xs text-slate-500">
        <span className="px-0.5 invisible">⠿</span>
        <span className="w-32">Folder</span>
        <span className="flex-1">Display Title</span>
        {ticketCounts && <span className="w-8" />}
        <span className="px-1 invisible">×</span>
      </div>
      <div className="space-y-1">
        {states.map((s, i) => (
          <div
            key={i}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
            onDrop={() => { if (dragIdx !== null) onMove(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center gap-2 rounded px-1 py-0.5 transition-colors ${
              dragIdx === i ? 'opacity-40' : ''
            } ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'bg-slate-700/50' : ''}`}
          >
            <span className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 select-none px-0.5">⠿</span>
            <input
              className="bg-slate-800 rounded px-2 py-1 text-sm w-32"
              placeholder="dir"
              value={s.dir}
              onChange={(e) => onUpdate(i, 'dir', e.target.value)}
            />
            <input
              className="bg-slate-800 rounded px-2 py-1 text-sm flex-1"
              placeholder="Display name"
              value={s.name}
              onChange={(e) => onUpdate(i, 'name', e.target.value)}
            />
            {ticketCounts && (
              <span className="text-xs text-slate-500 tabular-nums w-8 text-right">
                {ticketCounts[s.dir] ?? 0}
              </span>
            )}
            <button
              className="text-red-400 hover:text-red-300 text-sm px-1"
              onClick={() => onRemove(i)}
            >×</button>
          </div>
        ))}
      </div>
      <button className="mt-2 text-sm text-blue-400 hover:text-blue-300" onClick={onAdd}>+ Add state</button>
    </>
  );
}
