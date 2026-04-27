import { useTickets } from '../hooks/queries.js';
import type { LaneDetail, TicketSummary } from '@shared/types.js';
import { TicketCard } from './TicketCard.js';

interface Props { boardId: string; lane: LaneDetail }

export function Kanban({ boardId, lane }: Props) {
  const tickets = useTickets(boardId, lane.laneName);

  const grouped: Record<string, TicketSummary[]> = {};
  for (const s of lane.states) grouped[s.dir] = [];
  const orphaned: TicketSummary[] = [];
  for (const t of tickets.data?.tickets ?? []) {
    if (t.orphaned) orphaned.push(t);
    else grouped[t.state]?.push(t);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex gap-3 p-4">
        {lane.states.map((s) => {
          const items = grouped[s.dir] ?? [];
          return (
            <div key={s.dir} className="flex-1 min-w-0 bg-slate-900 rounded p-2">
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
