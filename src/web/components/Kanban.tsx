import { useState, useRef } from 'react';
import { useTickets, useMoveTicket } from '../hooks/queries.js';
import type { LaneDetail, TicketSummary } from '@shared/types.js';
import { TicketCard } from './TicketCard.js';
import { toast } from 'sonner';

interface Props { boardId: string; lane: LaneDetail }

export function Kanban({ boardId, lane }: Props) {
  const tickets = useTickets(boardId, lane.laneName);
  const moveTicket = useMoveTicket(boardId, lane.laneName);
  const dragRef = useRef<{ filename: string; fromState: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const grouped: Record<string, TicketSummary[]> = {};
  for (const s of lane.states) grouped[s.dir] = [];
  const orphaned: TicketSummary[] = [];
  for (const t of tickets.data?.tickets ?? []) {
    if (t.orphaned) orphaned.push(t);
    else grouped[t.state]?.push(t);
  }

  const handleDrop = (targetState: string) => {
    const drag = dragRef.current;
    if (!drag || drag.fromState === targetState) return;
    moveTicket.mutate(
      { filename: drag.filename, state: targetState },
      { onError: (err) => toast.error((err as Error).message) },
    );
    dragRef.current = null;
    setDropTarget(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex gap-3 p-4">
        {lane.states.map((s) => {
          const items = grouped[s.dir] ?? [];
          const isOver = dropTarget === s.dir && dragRef.current?.fromState !== s.dir;
          return (
            <div
              key={s.dir}
              className={`flex-1 min-w-0 rounded p-2 transition-colors ${
                isOver ? 'bg-blue-900/40 ring-2 ring-blue-500/50' : 'bg-slate-900'
              }`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(s.dir); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(s.dir); }}
            >
              <h3 className="text-sm font-semibold mb-2 px-1">
                {s.name} <span className="text-slate-500">({items.length})</span>
              </h3>
              {items.map((t) => (
                <TicketCard
                  key={t.filename}
                  boardId={boardId}
                  laneName={lane.laneName}
                  ticket={t}
                  draggable
                  onDragStart={(filename) => { dragRef.current = { filename, fromState: s.dir }; }}
                  onDragEnd={() => { dragRef.current = null; setDropTarget(null); }}
                />
              ))}
            </div>
          );
        })}
        {orphaned.length > 0 && (
          <div className="flex-1 min-w-0 bg-amber-950/30 rounded p-2">
            <h3 className="text-sm font-semibold mb-2 px-1 text-amber-400">Orphaned ({orphaned.length})</h3>
            {orphaned.map((t) => (
              <TicketCard key={t.filename} boardId={boardId} laneName={lane.laneName} ticket={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
