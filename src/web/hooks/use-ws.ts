import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WsClient, makeWsUrl } from '../lib/ws.js';
import type { WsEvent } from '@shared/events.js';

let singleton: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!singleton) {
    singleton = new WsClient(makeWsUrl());
    singleton.connect();
  }
  return singleton;
}

export function useWsInvalidation(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const client = getWsClient();
    const unsubscribe = client.subscribe((event: WsEvent) => {
      switch (event.type) {
        case 'workflow-changed':
          qc.invalidateQueries({ queryKey: ['workflows'] });
          qc.invalidateQueries({ queryKey: ['workflow', event.payload.workflowName] });
          qc.invalidateQueries({ queryKey: ['tickets', event.payload.workflowName] });
          return;
        case 'ticket-changed':
          // The workflows list carries per-state ticket counts, so a ticket
          // appearing or moving changes the sidebar too.
          qc.invalidateQueries({ queryKey: ['workflows'] });
          qc.invalidateQueries({ queryKey: ['tickets', event.payload.workflowName] });
          qc.invalidateQueries({ queryKey: ['ticket', event.payload.workflowName, event.payload.filename] });
          return;
        case 'project-changed':
          qc.invalidateQueries({ queryKey: ['projects'] });
          qc.invalidateQueries({ queryKey: ['project', event.payload.projectId] });
          // Effective permissions depend on project config, so any cached
          // preview is stale once a project changes.
          qc.invalidateQueries({ queryKey: ['ticket-permissions'] });
          return;
        case 'prompts-changed':
          qc.invalidateQueries({ queryKey: ['prompts'] });
          qc.invalidateQueries({ queryKey: ['prompt', event.payload.name] });
          return;
      }
    });
    return unsubscribe;
  }, [qc]);
}
