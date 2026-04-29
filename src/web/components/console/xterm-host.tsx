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

    const onResize = () => {
      try { fit?.fit(); } catch { return; }
      if (term) sendRuntimeResize(runtimeId, term.cols, term.rows);
    };

    const init = () => {
      if (disposed) return;
      term = new Terminal({ convertEol: true, fontFamily: 'ui-monospace, monospace', fontSize: 13 });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try { fit.fit(); } catch { /* ok */ }
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
      window.removeEventListener('resize', onResize);
      onKey?.dispose();
      unsub?.();
      term?.dispose();
    };
  }, [runtimeId]);
  return <div ref={ref} className="h-full w-full" />;
}
