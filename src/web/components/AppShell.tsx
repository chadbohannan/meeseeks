import { Outlet, Link } from 'react-router-dom';
import { useCurrentProject } from '../hooks/queries.js';
import { Sidebar } from './Sidebar.js';

export function AppShell() {
  const { data } = useCurrentProject();
  const project = data?.project;

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900 shrink-0">
        <Link to="/boards" className="font-semibold">Meeseeks</Link>
        <div className="flex items-center gap-3 text-sm">
          {project && (
            <span className="text-slate-400">{project.config.name}</span>
          )}
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <div className="w-60 shrink-0">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
