import { useState } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { useBoard, useLane, useCreateLane, usePatchLane, useDeleteLane, usePatchBoard } from '../hooks/queries.js';
import { NewLaneModal } from '../components/NewLaneModal.js';
import type { LaneSummary, LaneState } from '@shared/types.js';
import { toast } from 'sonner';

export function BoardEditorRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  const board = useBoard(boardId);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedLane = searchParams.get('lane');
  const [showNewLane, setShowNewLane] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [boardName, setBoardName] = useState('');
  const patchBoard = usePatchBoard(boardId!);

  if (!boardId) return <Navigate to="/boards" replace />;
  if (board.isLoading) return <div className="p-8 text-slate-500">Loading board…</div>;
  if (!board.data) return <div className="p-8 text-red-400">Board not found.</div>;

  const lanes = board.data.board.lanes;

  const startEditName = () => {
    setBoardName(board.data!.board.name);
    setEditingName(true);
  };

  const saveBoardName = async () => {
    if (boardName.trim() && boardName !== board.data!.board.name) {
      try {
        await patchBoard.mutateAsync({ name: boardName.trim() });
        toast.success('Board renamed');
      } catch (err) { toast.error((err as Error).message); }
    }
    setEditingName(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-800">
        {editingName ? (
          <input
            className="bg-slate-800 rounded px-2 py-1 text-lg font-semibold"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            onBlur={saveBoardName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveBoardName(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
          />
        ) : (
          <h1 className="text-lg font-semibold cursor-pointer hover:text-blue-400" onClick={startEditName}>
            {board.data.board.name}
          </h1>
        )}
        <button
          className="ml-auto px-3 py-1 rounded bg-slate-700 text-sm hover:bg-slate-600"
          onClick={() => setShowNewLane(true)}
        >+ Lane</button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-72 shrink-0 border-r border-slate-800 overflow-y-auto">
          {lanes.length === 0 && <p className="p-4 text-slate-500">No lanes yet.</p>}
          {lanes.map((lane) => (
            <LaneListItem
              key={lane.laneName}
              lane={lane}
              selected={selectedLane === lane.laneName}
              onClick={() => setSearchParams({ lane: lane.laneName })}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {selectedLane ? (
            <LaneEditor boardId={boardId} laneName={selectedLane} />
          ) : (
            <div className="p-8 text-slate-500">Select a lane to edit its configuration.</div>
          )}
        </div>
      </div>

      <NewLaneModal boardId={boardId} open={showNewLane} onClose={() => setShowNewLane(false)} />
    </div>
  );
}

function LaneListItem({ lane, selected, onClick }: { lane: LaneSummary; selected: boolean; onClick: () => void }) {
  const total = Object.values(lane.ticketCounts).reduce((a, b) => a + b, 0);
  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
        selected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{lane.laneName}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lane.states.map((s) => s.name).join(' → ')}
        </div>
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{total} tickets</span>
      {lane.orphanedCount > 0 && <span className="text-amber-400 text-xs">⚠ {lane.orphanedCount}</span>}
    </div>
  );
}

function LaneEditor({ boardId, laneName }: { boardId: string; laneName: string }) {
  const lane = useLane(boardId, laneName);
  const patchLane = usePatchLane(boardId, laneName);
  const deleteLane = useDeleteLane(boardId, laneName);
  const [, setSearchParams] = useSearchParams();
  const [states, setStates] = useState<LaneState[] | null>(null);

  if (lane.isLoading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!lane.data) return <div className="p-6 text-red-400">Lane not found.</div>;

  const currentStates = states ?? lane.data.lane.states;
  const dirty = states !== null;

  const updateState = (idx: number, field: keyof LaneState, value: string) => {
    const next = [...currentStates];
    next[idx] = { ...next[idx], [field]: value };
    setStates(next);
  };

  const addState = () => {
    setStates([...currentStates, { dir: '', name: '' }]);
  };

  const removeState = (idx: number) => {
    setStates(currentStates.filter((_, i) => i !== idx));
  };

  const moveState = (idx: number, dir: -1 | 1) => {
    const next = [...currentStates];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStates(next);
  };

  const save = async () => {
    if (!states) return;
    try {
      await patchLane.mutateAsync({ states });
      setStates(null);
      toast.success('Lane updated');
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete lane "${laneName}" and all its contents?`)) return;
    try {
      await deleteLane.mutateAsync({ deleteFiles: true });
      setSearchParams({});
      toast.success('Lane deleted');
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">{laneName}</h2>
        <button className="px-3 py-1 rounded bg-red-700/50 hover:bg-red-700 text-sm" onClick={handleDelete}>
          Delete Lane
        </button>
      </div>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">States</h3>
        <div className="space-y-2">
          {currentStates.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button
                  className="text-xs text-slate-500 hover:text-slate-300 leading-none"
                  onClick={() => moveState(i, -1)}
                  disabled={i === 0}
                >▲</button>
                <button
                  className="text-xs text-slate-500 hover:text-slate-300 leading-none"
                  onClick={() => moveState(i, 1)}
                  disabled={i === currentStates.length - 1}
                >▼</button>
              </div>
              <input
                className="bg-slate-800 rounded px-2 py-1 text-sm w-32"
                placeholder="dir"
                value={s.dir}
                onChange={(e) => updateState(i, 'dir', e.target.value)}
              />
              <input
                className="bg-slate-800 rounded px-2 py-1 text-sm flex-1"
                placeholder="Display name"
                value={s.name}
                onChange={(e) => updateState(i, 'name', e.target.value)}
              />
              <span className="text-xs text-slate-500 tabular-nums w-8 text-right">
                {lane.data!.lane.ticketCounts[s.dir] ?? 0}
              </span>
              <button
                className="text-red-400 hover:text-red-300 text-sm px-1"
                onClick={() => removeState(i)}
              >×</button>
            </div>
          ))}
        </div>
        <button className="mt-2 text-sm text-blue-400 hover:text-blue-300" onClick={addState}>+ Add state</button>
      </section>

      {dirty && (
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-blue-600 text-sm"
            onClick={save}
            disabled={patchLane.isPending}
          >Save</button>
          <button
            className="px-3 py-1 rounded bg-slate-700 text-sm"
            onClick={() => setStates(null)}
          >Discard</button>
        </div>
      )}

      {lane.data.lane.hasProcessDoc && (
        <section className="mt-8 pt-6 border-t border-slate-800">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">PROCESS.md</h3>
          <p className="text-xs text-slate-500">Process document editing coming soon.</p>
        </section>
      )}
    </div>
  );
}
