import { useState } from 'react';
import { useRecents, useOpenProject, useCurrentProject } from '../hooks/queries.js';
import { NewProjectModal } from '../components/NewProjectModal.js';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export function PickerRoute() {
  const recents = useRecents();
  const current = useCurrentProject();
  const open = useOpenProject();
  const [path, setPath] = useState('');
  const [showNew, setShowNew] = useState(false);

  if (current.data?.project) {
    return (
      <div className="p-8">
        <p className="mb-4">Project open: <span className="font-mono">{current.data.project.config.name}</span></p>
        <Link to="/boards" className="text-blue-400 underline">Go to boards →</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl mb-6">Open a project</h1>

      <form
        className="flex gap-2 mb-6"
        onSubmit={async (e) => {
          e.preventDefault();
          try { await open.mutateAsync({ path }); }
          catch (err) { toast.error((err as Error).message); }
        }}
      >
        <input
          className="flex-1 bg-slate-800 rounded px-3 py-2 font-mono text-sm"
          placeholder="/absolute/path/to/project"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button className="px-4 py-2 rounded bg-blue-600" type="submit" disabled={open.isPending}>Open</button>
        <button type="button" className="px-4 py-2 rounded bg-slate-700" onClick={() => setShowNew(true)}>New…</button>
      </form>

      <h2 className="text-lg mb-2">Recent</h2>
      {recents.isLoading && <p className="text-slate-500">Loading…</p>}
      {recents.data && recents.data.recents.length === 0 && <p className="text-slate-500">No recent projects.</p>}
      <ul className="space-y-1">
        {recents.data?.recents.map((r) => (
          <li key={r.path}>
            <button
              className={`text-left w-full px-2 py-1 rounded hover:bg-slate-800 ${r.available ? '' : 'text-slate-500'}`}
              onClick={async () => {
                if (!r.available) { toast.error('Project not available on disk'); return; }
                try { await open.mutateAsync({ path: r.path }); }
                catch (err) { toast.error((err as Error).message); }
              }}
            >
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-500 font-mono">{r.path}</div>
            </button>
          </li>
        ))}
      </ul>

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
