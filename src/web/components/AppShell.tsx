import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useCurrentProject, useCloseProject } from '../hooks/queries.js';
import { toast } from 'sonner';

export function AppShell() {
  const { data } = useCurrentProject();
  const close = useCloseProject();
  const navigate = useNavigate();
  const project = data?.project;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900">
        <Link to="/" className="font-semibold">Meeseeks</Link>
        <div className="flex items-center gap-3 text-sm">
          {project && (
            <>
              <Link to="/boards" className="text-slate-300 hover:text-slate-100">Boards</Link>
              <span className="text-slate-400">{project.config.name}</span>
              <button
                className="text-slate-400 hover:text-slate-100"
                onClick={async () => {
                  try { await close.mutateAsync(); navigate('/'); }
                  catch (e) { toast.error((e as Error).message); }
                }}
              >Close</button>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
