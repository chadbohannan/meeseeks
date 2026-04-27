import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useTickets, useLane, useCreateTicket } from '../hooks/queries.js';
import { TicketCard } from '../components/TicketCard.js';
import { toast } from 'sonner';

export function StateRoute() {
  const { boardId, laneName, stateDir } = useParams<{ boardId: string; laneName: string; stateDir: string }>();
  const lane = useLane(boardId, laneName);
  const tickets = useTickets(boardId, laneName);
  const create = useCreateTicket(boardId!, laneName!);
  const [newTitle, setNewTitle] = useState('');

  if (!boardId || !laneName || !stateDir) return <Navigate to="/boards" replace />;
  if (tickets.isLoading || lane.isLoading) return <div className="p-8 text-slate-500">Loading…</div>;

  const stateName = lane.data?.lane.states.find((s) => s.dir === stateDir)?.name ?? stateDir;
  const filtered = (tickets.data?.tickets ?? []).filter((t) => t.state === stateDir && !t.orphaned);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">{stateName}</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            try {
              await create.mutateAsync({ title: newTitle, state: stateDir });
              setNewTitle('');
            } catch (err) { toast.error((err as Error).message); }
          }}
        >
          <input
            className="bg-slate-800 rounded px-2 py-1 text-sm"
            placeholder="New ticket title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-sm" disabled={create.isPending}>Add</button>
        </form>
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
