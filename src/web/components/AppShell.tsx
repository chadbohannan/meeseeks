import { useRef, useState, useCallback } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useCurrentProject } from '../hooks/queries.js';
import { Logo } from './Logo.js';
import { Sidebar } from './Sidebar.js';
import { Dock } from './console/Dock.js';

const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 480;
const SIDEBAR_KEY = 'meeseeks:sidebar-width';

function loadWidth() {
  const v = localStorage.getItem(SIDEBAR_KEY);
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? 192 : Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
}

export function AppShell() {
  const { data } = useCurrentProject();
  const project = data?.project;
  const [width, setWidth] = useState(loadWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth.current + ev.clientX - startX.current));
      setWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      setWidth((w) => { localStorage.setItem(SIDEBAR_KEY, String(w)); return w; });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900 shrink-0">
        <Link to="/boards" className="flex items-center gap-2 font-semibold">
          <Logo size={24} />
          Meeseeks
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Dock />
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <div style={{ width }} className="shrink-0 relative">
          <Sidebar />
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500 active:bg-indigo-400 transition-colors"
            onMouseDown={onMouseDown}
          />
        </div>
        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
