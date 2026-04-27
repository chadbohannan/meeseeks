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
    const term = new Terminal({ convertEol: true, fontFamily: 'ui-monospace, monospace', fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try { fit.fit(); } catch { /* host may have zero size briefly */ }
    sendRuntimeResize(runtimeId, term.cols, term.rows);

    const unsub = onRuntimeStdio((id, bytes) => {
      if (id === runtimeId) term.write(bytes);
    });

    void api.getRuntimeSnapshot(runtimeId).then((snap) => {
      if (snap?.data) term.write(bytesFromB64(snap.data));
    }).catch(() => { /* silent */ });

    const onKey = term.onData((data) => {
      const enc = new TextEncoder();
      sendRuntimeInput(runtimeId, enc.encode(data));
    });

    const onResize = () => {
      try { fit.fit(); } catch { return; }
      sendRuntimeResize(runtimeId, term.cols, term.rows);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      onKey.dispose();
      unsub();
      term.dispose();
    };
  }, [runtimeId]);
  return <div ref={ref} className="h-full w-full" />;
}
