import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { onRuntimeStdio, sendRuntimeInput, sendRuntimeResize } from '../../hooks/use-runtime-ws.js';
import { api } from '../../lib/api.js';
import { bytesFromB64 } from '../../lib/b64.js';

export function XtermHost({ runtimeId }: { runtimeId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    let disposed = false;
    let term: Terminal | null = null;
    let fit: FitAddon | null = null;
    let unsub: (() => void) | null = null;
    let onKey: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | null = null;
    let lastCols = 0;
    let lastRows = 0;

    const onResize = () => {
      try { fit?.fit(); } catch { return; }
      if (!term) return;

      // Debounce resize events to avoid spamming during drag operations
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!term) return;
        // Only send if dimensions actually changed
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          sendRuntimeResize(runtimeId, term.cols, term.rows);
        }
      }, 100);
    };

    const init = () => {
      if (disposed) return;
      term = new Terminal({ convertEol: true, fontFamily: 'ui-monospace, monospace', fontSize: 13 });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try { fit.fit(); } catch { /* ok */ }
      lastCols = term.cols;
      lastRows = term.rows;
      sendRuntimeResize(runtimeId, term.cols, term.rows);

      unsub = onRuntimeStdio((id, bytes) => {
        if (id === runtimeId) term!.write(bytes);
      });

      void api.getRuntimeSnapshot(runtimeId).then((snap) => {
        if (snap?.data && term) term.write(bytesFromB64(snap.data));
      }).catch(() => { /* silent */ });

      onKey = term.onData((data) => {
        const enc = new TextEncoder();
        sendRuntimeInput(runtimeId, enc.encode(data));
      });

      window.addEventListener('resize', onResize);

      // Watch container for size changes (e.g., split slider movement)
      resizeObserver = new ResizeObserver(() => onResize());
      resizeObserver.observe(host);
    };

    if (host.offsetWidth > 0 && host.offsetHeight > 0) {
      init();
    } else {
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          ro.disconnect();
          init();
        }
      });
      ro.observe(host);
      return () => { disposed = true; ro.disconnect(); };
    }

    return () => {
      disposed = true;
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      onKey?.dispose();
      unsub?.();
      term?.dispose();
    };
  }, [runtimeId]);
  return <div ref={ref} className="h-full w-full" />;
}
