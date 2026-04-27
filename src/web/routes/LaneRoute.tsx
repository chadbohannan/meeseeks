import { useParams, Navigate } from 'react-router-dom';
import { useLane } from '../hooks/queries.js';
import { Kanban } from '../components/Kanban.js';

export function LaneRoute() {
  const { boardId, laneName } = useParams<{ boardId: string; laneName: string }>();
  const lane = useLane(boardId, laneName);

  if (!boardId || !laneName) return <Navigate to="/boards" replace />;
  if (lane.isLoading) return <div className="p-8 text-slate-500">Loading lane…</div>;
  if (!lane.data) return <div className="p-8 text-red-400">Lane not found.</div>;

  return <Kanban boardId={boardId} lane={lane.data.lane} />;
}
