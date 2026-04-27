import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useBoards, useBoard } from '../hooks/queries.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { NewBoardModal } from './NewBoardModal.js';
import type { BoardSummary, LaneSummary } from '@shared/types.js';

export function Sidebar() {
  const boards = useBoards();
  const [showNewBoard, setShowNewBoard] = useState(false);

  return (
    <nav className="flex flex-col h-full w-full bg-slate-950 border-r border-slate-800 overflow-y-auto text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Boards</span>
        <button
          className="text-xs px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          onClick={() => setShowNewBoard(true)}
        >+ Board</button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {boards.isLoading && <p className="px-3 py-2 text-slate-500">Loading…</p>}
        {boards.data?.boards.map((b) => (
          <BoardNode key={b.boardId} board={b} />
        ))}
        {boards.data && boards.data.boards.length === 0 && (
          <p className="px-3 py-4 text-slate-500 text-center">No boards yet</p>
        )}
      </div>
      <NewBoardModal open={showNewBoard} onClose={() => setShowNewBoard(false)} />
    </nav>
  );
}

function BoardNode({ board }: { board: BoardSummary }) {
  const { boardId: activeBoardId } = useParams();
  const navigate = useNavigate();
  const laneActive = useIsLaneActive();
  const isActive = activeBoardId === board.boardId;
  const isBoardOnly = isActive && !laneActive;
  const [expanded, setExpanded] = useState(isActive);

  const boardDetail = useBoard(expanded || isActive ? board.boardId : undefined);

  const handleClick = () => {
    navigate(`/boards/${encodeURIComponent(board.boardId)}`);
    setExpanded(true);
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-slate-800 ${
          isBoardOnly ? 'bg-slate-800 text-white' : 'text-slate-300'
        }`}
      >
        <button
          className="w-4 text-slate-500 hover:text-slate-300 shrink-0"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span
          className={`truncate flex-1 ${!board.available ? 'opacity-50' : ''}`}
          onClick={handleClick}
        >
          {board.name}
        </span>
      </div>
      {expanded && boardDetail.data && (
        <div className="ml-3">
          {boardDetail.data.board.lanes.map((lane) => (
            <LaneNode key={lane.laneName} boardId={board.boardId} lane={lane} />
          ))}
        </div>
      )}
    </div>
  );
}

function useIsLaneActive() {
  const location = useLocation();
  return /\/boards\/[^/]+\/lanes\//.test(location.pathname);
}

function useActiveState() {
  const { boardId, laneName } = useParams<{ boardId?: string; laneName?: string }>();
  const location = useLocation();
  const stateMatch = location.pathname.match(/\/state\/([^/]+)/);
  const ticketMatch = location.pathname.match(/\/tickets\/([^/]+)/);
  return {
    boardId,
    laneName,
    stateDir: stateMatch?.[1] ? decodeURIComponent(stateMatch[1]) : undefined,
    filename: ticketMatch?.[1] ? decodeURIComponent(ticketMatch[1]) : undefined,
  };
}

function LaneNode({ boardId, lane }: { boardId: string; lane: LaneSummary }) {
  const active = useActiveState();
  const navigate = useNavigate();
  const isActive = active.boardId === boardId && active.laneName === lane.laneName;
  const [expanded, setExpanded] = useState(isActive);

  const runtimes = useRuntimesStore((s) => s.byId);
  const hasActiveRuntime = Object.values(runtimes).some(
    (r) => r.ticketRef.boardId === boardId && r.ticketRef.laneName === lane.laneName &&
      (r.status === 'running' || r.status === 'starting' || r.status === 'idle'),
  );

  const totalTickets = Object.values(lane.ticketCounts).reduce((a, b) => a + b, 0);

  const handleClick = () => {
    navigate(`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(lane.laneName)}`);
    setExpanded(true);
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-slate-800 ${
          isActive && !active.stateDir && !active.filename ? 'bg-slate-800 text-white' : 'text-slate-300'
        }`}
      >
        <button
          className="w-4 text-slate-500 hover:text-slate-300 shrink-0"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="truncate flex-1" onClick={handleClick}>
          {lane.laneName}
        </span>
        <span className="text-xs text-slate-500 tabular-nums">{totalTickets}</span>
        {hasActiveRuntime && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Active runtime" />}
        {lane.orphanedCount > 0 && <span className="text-amber-400 text-xs shrink-0" title={`${lane.orphanedCount} orphaned`}>⚠</span>}
      </div>
      {expanded && (
        <div className="ml-5">
          {lane.states.map((st) => {
            const count = lane.ticketCounts[st.dir] ?? 0;
            const isStateActive = active.stateDir === st.dir && active.laneName === lane.laneName;
            return (
              <div
                key={st.dir}
                className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-slate-800 text-xs ${
                  isStateActive ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
                onClick={() =>
                  navigate(`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(lane.laneName)}/state/${encodeURIComponent(st.dir)}`)
                }
              >
                <span className="truncate flex-1">{st.name}</span>
                <span className="text-slate-500 tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
