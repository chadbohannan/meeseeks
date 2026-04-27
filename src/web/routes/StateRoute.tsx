import { useParams, Navigate } from 'react-router-dom';
import { useTickets, useLane } from '../hooks/queries.js';
import { TicketCard } from '../components/TicketCard.js';

export function StateRoute() {
  const { boardId, laneName, stateDir } = useParams<{ boardId: string; laneName: string; stateDir: string }>();
  const lane = useLane(boardId, laneName);
  const tickets = useTickets(boardId, laneName);

  if (!boardId || !laneName || !stateDir) return <Navigate to="/boards" replace />;
  if (tickets.isLoading || lane.isLoading) return <div className="p-8 text-slate-500">Loading…</div>;

  const stateName = lane.data?.lane.states.find((s) => s.dir === stateDir)?.name ?? stateDir;
  const filtered = (tickets.data?.tickets ?? []).filter((t) => t.state === stateDir && !t.orphaned);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">{stateName}</h2>
      {filtered.length === 0 && <p className="text-slate-500">No tickets in this state.</p>}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', maxWidth: '960px' }}>
        {filtered.map((t) => (
          <TicketCard key={t.filename} boardId={boardId} laneName={laneName} ticket={t} />
        ))}
      </div>
    </div>
  );
}
