import { useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useTickets, useLane, useCreateTicket } from '../hooks/queries.js';
import { TicketCard } from '../components/TicketCard.js';
import { ProjectFilter, ProjectSelect, matchesProjectFilter } from '../components/ProjectControls.js';
import { useUi, PROJECT_FILTER_ALL, PROJECT_FILTER_UNASSIGNED } from '../store/ui.js';
import { toast } from 'sonner';

export function StateRoute() {
  const { boardId, laneName, stateDir } = useParams<{ boardId: string; laneName: string; stateDir: string }>();
  const lane = useLane(boardId, laneName);
  const tickets = useTickets(boardId, laneName);
  const create = useCreateTicket(boardId!, laneName!);
  const [newTitle, setNewTitle] = useState('');
  const filter = useUi(s => s.projectFilter[boardId ?? ''] ?? PROJECT_FILTER_ALL);
  const setProjectFilter = useUi(s => s.setProjectFilter);
  const lastProject = useUi(s => s.lastProject);
  const setLastProject = useUi(s => s.setLastProject);

  // Seed the new-ticket project from the active filter when it names a real
  // project, otherwise from the last one explicitly chosen.
  const filterProject = filter === PROJECT_FILTER_ALL || filter === PROJECT_FILTER_UNASSIGNED
    ? undefined
    : filter;
  const [newProject, setNewProject] = useState<string | undefined>(filterProject ?? lastProject ?? undefined);

  if (!boardId || !laneName || !stateDir) return <Navigate to="/boards" replace />;
  if (tickets.isLoading || lane.isLoading) return <div className="p-8 text-slate-500">Loading…</div>;

  const stateName = lane.data?.lane.states.find((s) => s.dir === stateDir)?.name ?? stateDir;
  const inState = (tickets.data?.tickets ?? []).filter((t) => t.state === stateDir && !t.orphaned);
  const filtered = inState.filter((t) => matchesProjectFilter(t.project, filter));
  const hiddenCount = inState.length - filtered.length;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(laneName)}`} className="text-slate-400 hover:text-white text-lg font-semibold">{lane.data?.lane.displayName ?? laneName}</Link>
        <h2 className="text-lg font-semibold">{stateName}</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            try {
              await create.mutateAsync({ title: newTitle, state: stateDir, project: newProject });
              setNewTitle('');
              if (newProject) setLastProject(newProject);
            } catch (err) { toast.error((err as Error).message); }
          }}
        >
          <input
            className="bg-slate-800 rounded px-2 py-1 text-sm"
            placeholder="New ticket title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <ProjectSelect value={newProject} onChange={setNewProject} className="py-1" />
          <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-sm" disabled={create.isPending}>Add</button>
        </form>
        <div className="ml-auto flex items-center gap-3">
          <ProjectFilter value={filter} onChange={(v) => setProjectFilter(boardId, v)} />
          {hiddenCount > 0 && <span className="text-xs text-slate-500">{hiddenCount} hidden</span>}
        </div>
      </div>
      {filtered.length === 0 && <p className="text-slate-500">No tickets in this state.</p>}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <TicketCard key={t.filename} boardId={boardId} laneName={laneName} ticket={t} />
        ))}
      </div>
    </div>
  );
}
