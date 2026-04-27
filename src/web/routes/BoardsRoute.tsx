import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useBoards, useCurrentProject } from '../hooks/queries.js';
import { NewBoardModal } from '../components/NewBoardModal.js';

export function BoardsRoute() {
  const current = useCurrentProject();
  const boards = useBoards();
  const [showNew, setShowNew] = useState(false);

  if (!current.isLoading && !current.data?.project) return <Navigate to="/" replace />;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl">Boards</h1>
        <button className="px-3 py-1 rounded bg-blue-600" onClick={() => setShowNew(true)}>New board</button>
      </div>
      {boards.isLoading && <p className="text-slate-500">Loading…</p>}
      {boards.data && boards.data.boards.length === 0 && <p className="text-slate-500">No boards yet.</p>}
      <ul className="space-y-2">
        {boards.data?.boards.map((b) => (
          <li key={b.boardId}>
            <Link
              to={`/boards/${encodeURIComponent(b.boardId)}`}
              className={`block px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 ${b.available ? '' : 'opacity-50'}`}
            >
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-slate-500 font-mono">{b.path}</div>
            </Link>
          </li>
        ))}
      </ul>
      <NewBoardModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
