import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { useBoard, useLane, useCreateLane, usePatchLane, useDeleteLane, usePatchBoard } from '../hooks/queries.js';
import type { LaneSummary, LaneState } from '@shared/types.js';
import { toast } from 'sonner';
import { MarkdownEditor } from '../components/MarkdownEditor.js';
import { SkillsEditor } from '../components/SkillsEditor.js';
import { BinEditor } from '../components/BinEditor.js';

const NEW_LANE_KEY = '__new__';

const DEFAULT_STATES: LaneState[] = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'in-progress', name: 'In progress' },
  { dir: 'done', name: 'Done' },
];

export function BoardEditorRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  const board = useBoard(boardId);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedLane = searchParams.get('lane');
  const hasSelection = searchParams.get('context') === 'true' || searchParams.get('skills') === 'true' || searchParams.get('bin') === 'true' || !!selectedLane;
  const isContext = !hasSelection || searchParams.get('context') === 'true';
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
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-44 shrink-0 border-r border-slate-800 overflow-y-auto">
          <div
            className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
              isContext ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
            }`}
            onClick={() => setSearchParams({ context: 'true' })}
          >
            <span className="text-sm font-medium">CLAUDE.md</span>
          </div>
          <div
            className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
              searchParams.get('skills') === 'true' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
            }`}
            onClick={() => setSearchParams({ skills: 'true' })}
          >
            <span className="text-sm font-medium">.claude/skills</span>
          </div>
          <div
            className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
              searchParams.get('bin') === 'true' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
            }`}
            onClick={() => setSearchParams({ bin: 'true' })}
          >
            <span className="text-sm font-medium">.claude/bin</span>
          </div>
          {lanes.map((lane) => (
            <LaneListItem
              key={lane.laneName}
              lane={lane}
              selected={selectedLane === lane.laneName}
              onClick={() => setSearchParams({ lane: lane.laneName })}
            />
          ))}
          <div
            className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
              selectedLane === NEW_LANE_KEY ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400'
            }`}
            onClick={() => setSearchParams({ lane: NEW_LANE_KEY })}
          >
            <span className="text-sm">+ New Lane</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isContext ? (
            <ContextEditor boardId={boardId} />
          ) : searchParams.get('skills') === 'true' ? (
            <SkillsEditor boardId={boardId} />
          ) : searchParams.get('bin') === 'true' ? (
            <BinEditor boardId={boardId} />
          ) : selectedLane === NEW_LANE_KEY ? (
            <NewLaneEditor boardId={boardId} onCreated={(name) => setSearchParams({ lane: name })} />
          ) : selectedLane ? (
            <LaneEditor boardId={boardId} laneName={selectedLane} />
          ) : (
            <div className="p-8 text-slate-500">Select a lane to edit its configuration.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function LaneListItem({ lane, selected, onClick }: { lane: LaneSummary; selected: boolean; onClick: () => void }) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
        selected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{lane.displayName}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lane.states.map((s) => s.name).join(' → ')}
        </div>
      </div>
      {lane.orphanedCount > 0 && <span className="text-amber-400 text-xs">⚠ {lane.orphanedCount}</span>}
    </div>
  );
}

function NewLaneEditor({ boardId, onCreated }: { boardId: string; onCreated: (name: string) => void }) {
  const create = useCreateLane(boardId);
  const [name, setName] = useState('');
  const [states, setStates] = useState<LaneState[]>(DEFAULT_STATES);

  const updateState = (idx: number, field: keyof LaneState, value: string) => {
    const next = [...states];
    next[idx] = { ...next[idx], [field]: value };
    setStates(next);
  };

  const addState = () => setStates([...states, { dir: '', name: '' }]);

  const removeState = (idx: number) => setStates(states.filter((_, i) => i !== idx));

  const moveState = (from: number, to: number) => {
    if (from === to || to < 0 || to >= states.length) return;
    const next = [...states];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setStates(next);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Lane name is required'); return; }
    if (states.length === 0) { toast.error('At least one state is required'); return; }
    try {
      const result = await create.mutateAsync({ name: name.trim(), states });
      toast.success('Lane created');
      onCreated(result.lane.laneName);
      setName('');
      setStates(DEFAULT_STATES);
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-6">New Lane</h2>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Name</h3>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="Lane name (e.g. feature-work)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </section>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">States</h3>
        <StatesEditor states={states} onUpdate={updateState} onAdd={addState} onRemove={removeState} onMove={moveState} />
      </section>

      <button
        className="px-4 py-1.5 rounded bg-blue-600 text-sm hover:bg-blue-500"
        onClick={handleCreate}
        disabled={create.isPending}
      >Create Lane</button>
    </div>
  );
}

function LaneEditor({ boardId, laneName }: { boardId: string; laneName: string }) {
  const lane = useLane(boardId, laneName);
  const patchLane = usePatchLane(boardId, laneName);
  const deleteLane = useDeleteLane(boardId, laneName);
  const [, setSearchParams] = useSearchParams();
  const [states, setStates] = useState<LaneState[] | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const processTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  if (lane.isLoading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!lane.data) return <div className="p-6 text-red-400">Lane not found.</div>;

  const currentStates = states ?? lane.data.lane.states;
  const dirty = states !== null;

  const currentDisplayName = lane.data.lane.displayName;

  const startEditName = () => {
    setNewName(currentDisplayName);
    setEditingName(true);
  };

  const saveLaneName = async () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== currentDisplayName) {
      try {
        const result = await patchLane.mutateAsync({ name: trimmed });
        setSearchParams({ lane: result.lane.laneName });
        toast.success('Lane renamed');
      } catch (err) { toast.error((err as Error).message); }
    }
    setEditingName(false);
  };

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

  const moveState = (from: number, to: number) => {
    if (from === to || to < 0 || to >= currentStates.length) return;
    const next = [...currentStates];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
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
        {editingName ? (
          <input
            className="bg-slate-800 rounded px-2 py-1 text-lg font-semibold"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={saveLaneName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveLaneName(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
          />
        ) : (
          <h2 className="text-lg font-semibold cursor-pointer hover:text-blue-400" onClick={startEditName}>
            {currentDisplayName}
          </h2>
        )}
        <button className="px-3 py-1 rounded bg-red-700/50 hover:bg-red-700 text-sm" onClick={handleDelete}>
          Delete Lane
        </button>
      </div>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">States</h3>
        <StatesEditor
          states={currentStates}
          ticketCounts={lane.data!.lane.ticketCounts}
          onUpdate={updateState}
          onAdd={addState}
          onRemove={removeState}
          onMove={moveState}
        />
        {dirty && (
          <div className="flex gap-2 mt-3">
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
      </section>

      {lane.data.lane.hasProcessDoc && (
        <section className="mt-8 pt-6 border-t border-slate-800">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">PROCESS.md</h3>
          <MarkdownEditor
            value={lane.data.lane.processDoc ?? ''}
            onChange={(md) => {
              if (processTimerRef.current) clearTimeout(processTimerRef.current);
              processTimerRef.current = setTimeout(async () => {
                try {
                  await patchLane.mutateAsync({ processDoc: md });
                  toast.success('PROCESS.md saved');
                } catch (err) { toast.error((err as Error).message); }
              }, 1000);
            }}
            className="w-full bg-slate-800 rounded min-h-48"
            placeholder="Write process documentation…"
          />
        </section>
      )}
    </div>
  );
}

interface StatesEditorProps {
  states: LaneState[];
  ticketCounts?: Record<string, number>;
  onUpdate: (idx: number, field: keyof LaneState, value: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
}

function StatesEditor({ states, ticketCounts, onUpdate, onAdd, onRemove, onMove }: StatesEditorProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  return (
    <>
      <div className="flex items-center gap-2 px-1 mb-1 text-xs text-slate-500">
        <span className="px-0.5 invisible">⠿</span>
        <span className="w-32">Folder</span>
        <span className="flex-1">Display Title</span>
        {ticketCounts && <span className="w-8" />}
        <span className="px-1 invisible">×</span>
      </div>
      <div className="space-y-1">
        {states.map((s, i) => (
          <div
            key={i}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
            onDrop={() => { if (dragIdx !== null) onMove(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center gap-2 rounded px-1 py-0.5 transition-colors ${
              dragIdx === i ? 'opacity-40' : ''
            } ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'bg-slate-700/50' : ''}`}
          >
            <span className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 select-none px-0.5">⠿</span>
            <input
              className="bg-slate-800 rounded px-2 py-1 text-sm w-32"
              placeholder="dir"
              value={s.dir}
              onChange={(e) => onUpdate(i, 'dir', e.target.value)}
            />
            <input
              className="bg-slate-800 rounded px-2 py-1 text-sm flex-1"
              placeholder="Display name"
              value={s.name}
              onChange={(e) => onUpdate(i, 'name', e.target.value)}
            />
            {ticketCounts && (
              <span className="text-xs text-slate-500 tabular-nums w-8 text-right">
                {ticketCounts[s.dir] ?? 0}
              </span>
            )}
            <button
              className="text-red-400 hover:text-red-300 text-sm px-1"
              onClick={() => onRemove(i)}
            >×</button>
          </div>
        ))}
      </div>
      <button className="mt-2 text-sm text-blue-400 hover:text-blue-300" onClick={onAdd}>+ Add state</button>
    </>
  );
}

function ContextEditor({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const patchBoard = usePatchBoard(boardId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  if (board.isLoading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!board.data) return <div className="p-6 text-red-400">Board not found.</div>;

  return (
    <div className="p-6 max-w-2xl">
      <MarkdownEditor
        value={board.data.board.claudeContent ?? ''}
        onChange={(md) => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(async () => {
            try {
              await patchBoard.mutateAsync({ claudeContent: md });
              toast.success('Context saved');
            } catch (err) { toast.error((err as Error).message); }
          }, 1000);
        }}
        className="w-full bg-slate-800 rounded min-h-96"
        placeholder="Write CLAUDE.md context…"
      />
    </div>
  );
}
