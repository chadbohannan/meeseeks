import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getWsClient } from './use-ws.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { usePromptsStore } from '../store/prompts.js';
import { bytesFromB64, b64FromBytes } from '../lib/b64.js';

type StdioHandler = (runtimeId: string, bytes: Uint8Array) => void;
const handlers = new Set<StdioHandler>();

export function onRuntimeStdio(h: StdioHandler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}

export function useRuntimeWs(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const client = getWsClient();
    return client.subscribe((evt) => {
      if (evt.type === 'runtime-spawned') {
        const store = useRuntimesStore.getState();
        const incoming = evt.payload;
        if (incoming.kind === 'ticket' && incoming.ticketRef) {
          Object.values(store.byId).forEach(r => {
            if (
              r.runtimeId !== incoming.runtimeId &&
              r.kind === 'ticket' && r.ticketRef &&
              r.ticketRef.boardId === incoming.ticketRef!.boardId &&
              r.ticketRef.laneName === incoming.ticketRef!.laneName &&
              r.ticketRef.filename === incoming.ticketRef!.filename &&
              (r.status === 'exited' || r.status === 'errored' || r.status === 'terminating')
            ) {
              store.remove(r.runtimeId);
            }
          });
        }
        store.upsert(incoming);
        qc.invalidateQueries({ queryKey: ['runtimes'] });
      } else if (evt.type === 'runtime-status') {
        useRuntimesStore.getState().setStatus(
          evt.payload.runtimeId, evt.payload.status, evt.payload.exitCode, evt.payload.errorMessage,
        );
        const status = evt.payload.status;
        if (status === 'exited' || status === 'errored' || status === 'terminating') {
          // For prompt runtimes, hide the dock chip after ~3 seconds.
          const r = useRuntimesStore.getState().byId[evt.payload.runtimeId];
          if (r?.kind === 'prompt') {
            setTimeout(() => {
              usePromptsStore.getState().hide(evt.payload.runtimeId);
              useRuntimesStore.getState().remove(evt.payload.runtimeId);
            }, 3000);
          }
        }
        qc.invalidateQueries({ queryKey: ['runtimes'] });
      } else if (evt.type === 'runtime-stdio') {
        const bytes = bytesFromB64(evt.payload.data);
        for (const h of handlers) h(evt.payload.runtimeId, bytes);
      } else if (evt.type === 'runtime-message') {
        usePromptsStore.getState().appendOutput(evt.payload.runtimeId, evt.payload.text + '\n');
      }
    });
  }, [qc]);
}

export function sendRuntimeInput(runtimeId: string, bytes: Uint8Array): void {
  getWsClient().send({ type: 'runtime-input', payload: { runtimeId, data: b64FromBytes(bytes) } });
}

export function sendRuntimeResize(runtimeId: string, cols: number, rows: number): void {
  getWsClient().send({ type: 'runtime-resize', payload: { runtimeId, cols, rows } });
}
