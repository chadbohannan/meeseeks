import { Link } from 'react-router-dom';
import { useState, useRef } from 'react';
import { useTickets, useMoveTicket } from '../hooks/queries.js';
import type { WorkflowDetail, TicketSummary } from '@shared/types.js';
import { TicketCard } from './TicketCard.js';
import { ProjectFilter, FilteredEmptyNotice, matchesProjectFilter } from './ProjectControls.js';
import { useUi, PROJECT_FILTER_ALL } from '../store/ui.js';
import { toast } from 'sonner';

interface Props { workflow: WorkflowDetail }

export function Kanban({ workflow }: Props) {
  const tickets = useTickets(workflow.workflowName);
  const moveTicket = useMoveTicket(workflow.workflowName);
  const dragRef = useRef<{ filename: string; fromState: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const filter = useUi(s => s.projectFilter[workflow.workflowName] ?? PROJECT_FILTER_ALL);
  const setProjectFilter = useUi(s => s.setProjectFilter);

  const all = tickets.data?.tickets ?? [];
  // Filtering is client-side: the board's tickets are already fully loaded, so
  // this stays instant and avoids adding a dimension to the query cache key.
  const visible = all.filter(t => matchesProjectFilter(t.project, filter));
  const hiddenCount = all.length - visible.length;

  const grouped: Record<string, TicketSummary[]> = {};
  for (const s of workflow.states) grouped[s.dir] = [];
  const orphaned: TicketSummary[] = [];
  for (const t of visible) {
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
      <div className="flex items-center gap-3 px-4 pt-3 shrink-0">
        <h2 className="text-lg font-semibold">{workflow.displayName}</h2>
        <ProjectFilter value={filter} onChange={(v) => setProjectFilter(workflow.workflowName, v)} />
        {hiddenCount > 0 && visible.length > 0 && (
          <span className="text-xs text-slate-400">{hiddenCount} hidden by filter</span>
        )}
        <Link
          to={`/workflows/${encodeURIComponent(workflow.workflowName)}/edit`}
          className="ml-auto text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
        >Configure</Link>
      </div>
      {hiddenCount > 0 && visible.length === 0 && (
        <div className="px-4 pt-2 shrink-0">
          <FilteredEmptyNotice
            hiddenCount={hiddenCount}
            onClear={() => setProjectFilter(workflow.workflowName, PROJECT_FILTER_ALL)}
          />
        </div>
      )}
      <div className="flex-1 flex gap-3 p-4">
        {workflow.states.map((s) => {
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
                <Link
                  to={`/workflows/${encodeURIComponent(workflow.workflowName)}/state/${encodeURIComponent(s.dir)}`}
                  className="hover:text-blue-400 hover:underline"
                >
                  {s.name}
                </Link>{' '}
                <span className="text-slate-500">({items.length})</span>
              </h3>
              {items.map((t) => (
                <TicketCard
                  key={t.filename}
                  workflowName={workflow.workflowName}
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
              <TicketCard key={t.filename} workflowName={workflow.workflowName} ticket={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
