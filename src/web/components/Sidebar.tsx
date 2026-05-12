import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useBoards, useBoard, useTickets } from '../hooks/queries.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { useUi, boardCollapseKey, laneCollapseKey } from '../store/ui.js';
import { RuntimeStatusDot } from './RuntimeStatusDot.js';
import { NewBoardModal } from './NewBoardModal.js';
import type { BoardSummary, LaneSummary } from '@shared/types.js';
import type { RuntimeSummary } from '@shared/runtime.js';

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

  const boardDetail = useBoard(board.boardId);

  const userCollapsed = useUi((s) => !!s.collapsed[boardCollapseKey(board.boardId)]);
  const toggleCollapsed = useUi((s) => s.toggleCollapsed);
  const runtimes = useRuntimesStore((s) => s.byId);
  const hasActiveRuntime = Object.values(runtimes).some(
    (r) => r.kind === 'ticket' && r.ticketRef?.boardId === board.boardId && isRuntimeActive(r),
  );
  const effectiveCollapsed = userCollapsed && !hasActiveRuntime;
  const lanes = boardDetail.data?.board.lanes ?? [];

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-slate-800 ${
          isBoardOnly ? 'bg-slate-800 text-white' : 'text-slate-300'
        }`}
        onClick={() => navigate(`/boards/${encodeURIComponent(board.boardId)}`)}
      >
        <CollapseToggle
          collapsed={effectiveCollapsed}
          visible={lanes.length > 0}
          onToggle={() => toggleCollapsed(boardCollapseKey(board.boardId))}
        />
        <span className={`truncate flex-1 ${!board.available ? 'opacity-50' : ''}`}>
          {board.name}
        </span>
      </div>
      {boardDetail.data && !effectiveCollapsed && (
        <div className="ml-3">
          {lanes.map((lane) => (
            <LaneNode
              key={lane.laneName}
              boardId={board.boardId}
              lane={lane}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollapseToggle({
  collapsed,
  visible,
  onToggle,
}: {
  collapsed: boolean;
  visible: boolean;
  onToggle: () => void;
}) {
  if (!visible) {
    return <span className="inline-block w-5 shrink-0" aria-hidden />;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-100"
      aria-label={collapsed ? 'Expand' : 'Collapse'}
    >
      <span className="text-base leading-none">{collapsed ? '▸' : '▾'}</span>
    </button>
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

function isRuntimeActive(r: RuntimeSummary) {
  return r.status === 'running' || r.status === 'starting' || r.status === 'idle' || r.status === 'awaiting-user';
}

function LaneNode({ boardId, lane }: { boardId: string; lane: LaneSummary }) {
  const active = useActiveState();
  const navigate = useNavigate();
  const isActive = active.boardId === boardId && active.laneName === lane.laneName;

  const runtimes = useRuntimesStore((s) => s.byId);
  const laneRuntimes = Object.values(runtimes).filter(
    (r) => r.kind === 'ticket' && r.ticketRef?.boardId === boardId && r.ticketRef?.laneName === lane.laneName && isRuntimeActive(r),
  );
  const hasActiveRuntime = laneRuntimes.length > 0;

  const tickets = useTickets(hasActiveRuntime ? boardId : undefined, hasActiveRuntime ? lane.laneName : undefined);
  const ticketsByFilename = new Map(
    (tickets.data?.tickets ?? []).map((t) => [t.filename, t]),
  );

  const userCollapsed = useUi((s) => !!s.collapsed[laneCollapseKey(boardId, lane.laneName)]);
  const toggleCollapsed = useUi((s) => s.toggleCollapsed);
  const effectiveCollapsed = userCollapsed && !hasActiveRuntime;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-slate-800 ${
          isActive && !active.stateDir && !active.filename ? 'bg-slate-800 text-white' : 'text-slate-300'
        }`}
        onClick={() => navigate(`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(lane.laneName)}`)}
      >
        <CollapseToggle
          collapsed={effectiveCollapsed}
          visible={lane.states.length > 0}
          onToggle={() => toggleCollapsed(laneCollapseKey(boardId, lane.laneName))}
        />
        <span className="truncate flex-1">
          {lane.displayName}
        </span>
      </div>
      {!effectiveCollapsed && (
      <div className="ml-5">
        {lane.states.map((st) => {
          const count = lane.ticketCounts[st.dir] ?? 0;
          const isStateActive = active.stateDir === st.dir && active.laneName === lane.laneName;
          const stateRuntimes = laneRuntimes.filter((r) => {
            if (!r.ticketRef) return false;
            const ticket = ticketsByFilename.get(r.ticketRef!.filename);
            return ticket?.state === st.dir;
          });
          return (
            <div key={st.dir}>
              <div
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
              {stateRuntimes.map((r) => {
                const ticket = ticketsByFilename.get(r.ticketRef!.filename);
                const isTicketActive = active.filename === r.ticketRef!.filename && active.laneName === lane.laneName;
                return (
                  <div
                    key={r.runtimeId}
                    className={`flex items-center gap-1.5 pl-4 pr-2 py-[7px] my-[5px] rounded-md cursor-pointer hover:bg-slate-800 text-sm ${
                      isTicketActive ? 'bg-slate-800 text-white' : 'text-slate-400'
                    }`}
                    style={{ border: `2px solid ${ticket?.color || "#6b7280"}` }}
                    onClick={() =>
                      navigate(`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(lane.laneName)}/tickets/${encodeURIComponent(r.ticketRef!.filename)}`)
                    }
                  >
                    <span className="truncate whitespace-nowrap">{ticket?.title ?? r.ticketRef!.filename}</span>
                    <RuntimeStatusDot status={r.status} className="shrink-0 ml-auto h-3 w-3" />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
