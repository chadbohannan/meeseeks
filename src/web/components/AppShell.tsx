import { useRef, useState, useCallback } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useWorkspace } from '../hooks/queries.js';
import { Logo } from './Logo.js';
import { Sidebar } from './Sidebar.js';
import { Dock } from './console/Dock.js';

const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 480;
const SIDEBAR_KEY = 'meeseeks:sidebar-width';
const SIDEBAR_VISIBLE_KEY = 'meeseeks:sidebar-visible';

function loadWidth() {
  const v = localStorage.getItem(SIDEBAR_KEY);
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? 192 : Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
}

function loadVisible() {
  return localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== 'false';
}

export function AppShell() {
  useWorkspace();
  const [width, setWidth] = useState(loadWidth);
  const [sidebarVisible, setSidebarVisible] = useState(loadVisible);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_VISIBLE_KEY, String(next));
      return next;
    });
  }, []);

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
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2 bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            aria-pressed={sidebarVisible}
            title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="2.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="6.5" y1="2.5" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <Link to="/boards" className="flex items-center gap-2 font-semibold">
            <Logo size={24} />
            Meeseeks
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm min-w-0 flex-1 justify-end">
          <Dock />
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        {sidebarVisible && (
          <div style={{ width }} className="shrink-0 relative">
            <Sidebar />
            <div
              className="group absolute top-0 h-full cursor-col-resize"
              style={{ right: -2, width: 9 }}
              onMouseDown={onMouseDown}
            >
              <div className="absolute top-0 right-[2px] w-1 h-full group-hover:bg-indigo-500 group-active:bg-indigo-400 transition-colors" />
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
