import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TicketSummary } from '@shared/types.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { RuntimeStatusDot } from './RuntimeStatusDot.js';
import { Markdown } from './Markdown.js';

interface Props {
  boardId: string;
  laneName: string;
  ticket: TicketSummary;
  draggable?: boolean;
  onDragStart?: (filename: string) => void;
  onDragEnd?: () => void;
}

export function TicketCard({ boardId, laneName, ticket, draggable, onDragStart, onDragEnd }: Props) {
  const didDrag = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const runtime = useRuntimesStore((s) =>
    Object.values(s.byId).find(r =>
      r.kind === 'ticket' &&
      r.ticketRef?.boardId === boardId &&
      r.ticketRef?.laneName === laneName &&
      r.ticketRef?.filename === ticket.filename));
  return (
    <Link
      to={`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(laneName)}/tickets/${encodeURIComponent(ticket.filename)}`}
      className="relative block bg-slate-800 hover:bg-slate-700 rounded p-3 mb-2 overflow-hidden" style={{ border: ticket.color ? `2px solid ${ticket.color}` : "2px solid #6b7280" }}
      draggable={draggable}
      onClick={(e) => { if (didDrag.current) { e.preventDefault(); didDrag.current = false; } }}
      onDragStart={(e) => {
        didDrag.current = true;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(ticket.filename);
      }}
      onDragEnd={() => {
        onDragEnd?.();
        setTimeout(() => { didDrag.current = false; }, 0);
      }}
    >
      {ticket.body && (
        <button
          className="absolute top-2 right-2 flex flex-col items-center leading-none text-slate-500 hover:text-slate-300"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(x => !x); }}
        >
          <span className="text-[8px]">{expanded ? '▼' : '▲'}</span>
          <span className="text-[8px]">{expanded ? '▲' : '▼'}</span>
        </button>
      )}
      <div className="flex items-center gap-2">
        {runtime && <RuntimeStatusDot status={runtime.status} />}
        <div className="font-medium text-xl">{ticket.title}</div>
      </div>
      <div className="text-xs text-slate-500 mt-1">{new Date(ticket.updated).toLocaleString()}</div>
      {ticket.body && (
        <div className={`text-xs text-slate-300 mt-2 overflow-hidden${expanded ? '' : ' max-h-16'}`}>
          <Markdown>{ticket.body}</Markdown>
        </div>
      )}
      {ticket.orphaned && <div className="text-xs text-amber-400 mt-1">orphaned</div>}
    </Link>
  );
}
