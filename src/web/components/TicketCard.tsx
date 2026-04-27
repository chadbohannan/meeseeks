import { Link } from 'react-router-dom';
import type { TicketSummary } from '@shared/types.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { RuntimeStatusDot } from './RuntimeStatusDot.js';

interface Props { boardId: string; laneName: string; ticket: TicketSummary }

export function TicketCard({ boardId, laneName, ticket }: Props) {
  const runtime = useRuntimesStore((s) =>
    Object.values(s.byId).find(r =>
      r.ticketRef.boardId === boardId &&
      r.ticketRef.laneName === laneName &&
      r.ticketRef.filename === ticket.filename));
  return (
    <Link
      to={`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(laneName)}/tickets/${encodeURIComponent(ticket.filename)}`}
      className="block bg-slate-800 hover:bg-slate-700 rounded p-3 mb-2"
    >
      <div className="flex items-center gap-2">
        {runtime && <RuntimeStatusDot status={runtime.status} />}
        <div className="font-medium text-sm">{ticket.title}</div>
      </div>
      <div className="text-xs text-slate-500 mt-1">{new Date(ticket.updated).toLocaleString()}</div>
      {ticket.orphaned && <div className="text-xs text-amber-400 mt-1">orphaned</div>}
    </Link>
  );
}
