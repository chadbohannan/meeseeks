import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useBoard, useLane } from '../hooks/queries.js';
import { useUi } from '../store/ui.js';
import { Kanban } from '../components/Kanban.js';
import { NewLaneModal } from '../components/NewLaneModal.js';

export function BoardRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  const board = useBoard(boardId);
  const { selectedLane, setSelectedLane } = useUi();
  const [showNewLane, setShowNewLane] = useState(false);

  useEffect(() => {
    const lanes = board.data?.board.lanes;
    if (!lanes) return;
    if (!selectedLane || !lanes.find((l) => l.laneName === selectedLane)) {
      setSelectedLane(lanes[0]?.laneName ?? null);
    }
  }, [board.data, selectedLane, setSelectedLane]);

  const lane = useLane(boardId, selectedLane ?? undefined);

  if (!boardId) return <Navigate to="/boards" replace />;
  if (board.isLoading) return <div className="p-8 text-slate-500">Loading board…</div>;
  if (!board.data) return <div className="p-8 text-red-400">Board not found.</div>;

  const lanes = board.data.board.lanes;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <h1 className="text-lg font-semibold mr-4">{board.data.board.name}</h1>
        {lanes.length === 0 ? (
          <span className="text-slate-500 text-sm">No lanes yet.</span>
        ) : (
          <select
            className="bg-slate-800 rounded px-2 py-1 text-sm"
            value={selectedLane ?? ''}
            onChange={(e) => setSelectedLane(e.target.value)}
          >
            {lanes.map((l) => <option key={l.laneName} value={l.laneName}>{l.laneName}</option>)}
          </select>
        )}
        <button className="px-2 py-1 rounded bg-slate-700 text-sm" onClick={() => setShowNewLane(true)}>+ Lane</button>
      </div>
      {selectedLane && lane.data && (
        <Kanban boardId={boardId} lane={lane.data.lane} />
      )}
      <NewLaneModal boardId={boardId} open={showNewLane} onClose={() => setShowNewLane(false)} />
    </div>
  );
}
