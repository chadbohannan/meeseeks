import { useState } from 'react';
import { useTickets, useCreateTicket } from '../hooks/queries.js';
import type { LaneDetail, TicketSummary } from '@shared/types.js';
import { TicketCard } from './TicketCard.js';
import { toast } from 'sonner';

interface Props { boardId: string; lane: LaneDetail }

export function Kanban({ boardId, lane }: Props) {
  const tickets = useTickets(boardId, lane.laneName);
  const create = useCreateTicket(boardId, lane.laneName);
  const [newTitle, setNewTitle] = useState('');
  const [newState, setNewState] = useState(lane.states[0]?.dir ?? '');

  const grouped: Record<string, TicketSummary[]> = {};
  for (const s of lane.states) grouped[s.dir] = [];
  const orphaned: TicketSummary[] = [];
  for (const t of tickets.data?.tickets ?? []) {
    if (t.orphaned) orphaned.push(t);
    else grouped[t.state]?.push(t);
  }

  return (
    <div className="flex flex-col h-full">
      <form
        className="flex gap-2 px-4 py-2 border-b border-slate-800"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newTitle.trim() || !newState) return;
          try {
            await create.mutateAsync({ title: newTitle, state: newState });
            setNewTitle('');
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <input
          className="flex-1 bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="New ticket title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <select className="bg-slate-800 rounded px-2 py-1 text-sm" value={newState} onChange={(e) => setNewState(e.target.value)}>
          {lane.states.map((s) => <option key={s.dir} value={s.dir}>{s.name}</option>)}
        </select>
        <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-sm" disabled={create.isPending}>Add</button>
      </form>
      <div className="flex-1 flex gap-3 overflow-x-auto p-4">
        {lane.states.map((s) => {
          const items = grouped[s.dir] ?? [];
          return (
            <div key={s.dir} className="w-72 shrink-0 bg-slate-900 rounded p-2">
              <h3 className="text-sm font-semibold mb-2 px-1">
                {s.name} <span className="text-slate-500">({items.length})</span>
              </h3>
              {items.map((t) => (
                <TicketCard key={t.filename} boardId={boardId} laneName={lane.laneName} ticket={t} />
              ))}
            </div>
          );
        })}
        {orphaned.length > 0 && (
          <div className="w-72 shrink-0 bg-amber-950/30 rounded p-2">
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
