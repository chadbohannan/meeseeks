import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLane, useTicket, useDeleteTicket, useSpawnRuntime, useTerminateRuntime } from '../hooks/queries.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { RuntimeStatusDot } from '../components/RuntimeStatusDot.js';
import { ResizableSplit } from '../components/ResizableSplit.js';
import { XtermHost } from '../components/console/xterm-host.js';
import { toast } from 'sonner';
import { MarkdownEditor } from '../components/MarkdownEditor.js';
import { api } from '../lib/api.js';
import type { PatchTicketRequest } from '@shared/api.js';

// Treat bodies as equivalent if they only differ in trailing whitespace —
// gray-matter normalization on the server adds/removes a trailing newline on
// round-trip, which would otherwise look like an external edit.
function bodiesEquivalent(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd();
}

// The persistent identity of a ticket (board + lane + filename). Saves are
// authored against an Identity captured at edit time, so an in-flight or
// debounced save always lands at the file the user was editing — even if the
// route has since navigated to a different ticket.
type Identity = { boardId: string; laneName: string; filename: string };
function sameIdentity(a: Identity, b: Identity): boolean {
  return a.boardId === b.boardId && a.laneName === b.laneName && a.filename === b.filename;
}

export function TicketRoute() {
  const { boardId, laneName, filename } = useParams<{ boardId: string; laneName: string; filename: string }>();
  const lane = useLane(boardId, laneName);
  const ticket = useTicket(boardId, laneName, filename);
  const del = useDeleteTicket(boardId!, laneName!, filename!);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const spawn = useSpawnRuntime();
  const term = useTerminateRuntime();
  const runtime = useRuntimesStore((s) =>
    Object.values(s.byId).find(r =>
      r.kind === 'ticket' &&
      r.ticketRef?.boardId === boardId && r.ticketRef?.laneName === laneName && r.ticketRef?.filename === filename));

  const activeRuntime =
    runtime && !['exited', 'errored', 'terminating'].includes(runtime.status)
      ? runtime
      : null;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'console' | 'context'>('console');
  const [model, setModel] = useState('claude-sonnet-4-6');
  // Body the server most recently persisted (whether we wrote it or it came in
  // from a fresh load). Used to distinguish echoes of our own saves from genuine
  // external edits.
  const lastPersistedBodyRef = useRef<string | null>(null);
  // ISO timestamp of the server snapshot that lastPersistedBodyRef came from.
  // Used to discard stale watcher-driven refetches that resolve after a newer
  // save has already updated lastPersistedBodyRef.
  const lastPersistedUpdatedRef = useRef<string | null>(null);
  const bodyFocusedRef = useRef(false);
  const conflictNotifiedRef = useRef(false);
  const bodyRef = useRef('');
  bodyRef.current = body;
  // Counts saves that have been dispatched but not yet resolved. The filesystem
  // watcher often fires (and the WS-driven refetch completes) before our own
  // PATCH response returns, leaving lastPersistedBodyRef stale and producing a
  // false external-change toast. Suppress notifications while any save is open.
  const savesInFlightRef = useRef(0);

  // The identity (board+lane+filename) currently displayed. Updated by the
  // identity-change effect below after it flushes pending writes against the
  // outgoing identity. Read via ref so save handlers can snapshot the correct
  // target at the moment of edit, without depending on React render timing.
  const identityRef = useRef<Identity | null>(null);

  // Pending debounced save: a snapshot of {identity, fields}. The identity is
  // baked in at edit time so the eventual PATCH always lands at the file the
  // user was editing, even if the route has since shifted to another ticket.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ identity: Identity; fields: PatchTicketRequest } | null>(null);

  const performSave = useCallback(async (identity: Identity, fields: PatchTicketRequest) => {
    savesInFlightRef.current++;
    try {
      const res = await api.patchTicket(identity.boardId, identity.laneName, identity.filename, fields);
      // Only update the echo-tracking refs if the save was for the currently
      // displayed ticket. A late-arriving response for the previous ticket must
      // not poison the new ticket's conflict-detection state.
      const current = identityRef.current;
      if (current && sameIdentity(current, identity)) {
        lastPersistedBodyRef.current = res.ticket.body;
        lastPersistedUpdatedRef.current = res.ticket.updated;
        conflictNotifiedRef.current = false;
        if (fields.body !== undefined && bodyRef.current === fields.body) setDirty(false);
      }
      qc.invalidateQueries({ queryKey: ['tickets', identity.boardId, identity.laneName] });
      qc.invalidateQueries({ queryKey: ['board', identity.boardId] });
    } catch (err) { toast.error((err as Error).message); }
    finally { savesInFlightRef.current--; }
  }, [qc]);

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) await performSave(pending.identity, pending.fields);
  }, [performSave]);

  const debouncedSaveBody = useCallback((newBody: string) => {
    const id = identityRef.current;
    if (!id) return;
    setBody(newBody);
    setDirty(true);
    // Snapshot identity and the full field set into the pending save. If the
    // user navigates away before the timer fires, this snapshot still routes
    // the write to the original file.
    pendingSaveRef.current = { identity: id, fields: { title, body: newBody, state, color } };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) void performSave(pending.identity, pending.fields);
    }, 3000);
  }, [performSave, title, state, color]);

  // Identity-change handler. When the route's (boardId, laneName, filename)
  // tuple shifts — e.g. user clicks a different ticket — flush any pending
  // save against the outgoing identity, then reset local state so the load
  // effect below can populate the new ticket fresh. This replaces both the
  // unmount-only flush (which never fired on in-route navigation) and the
  // dirty-bail in the load effect (which used to strand the old body under
  // the new ticket's header).
  useEffect(() => {
    if (!boardId || !laneName || !filename) return;
    const next: Identity = { boardId, laneName, filename };
    const prev = identityRef.current;
    if (prev && !sameIdentity(prev, next)) {
      // Don't await: the pending snapshot already carries the old identity, so
      // the flush lands correctly while the new ticket mounts immediately.
      void flushPendingSave();
      setTitle('');
      setBody('');
      setState('');
      setColor(undefined);
      setDirty(false);
      bodyFocusedRef.current = false;
      lastPersistedBodyRef.current = null;
      lastPersistedUpdatedRef.current = null;
      conflictNotifiedRef.current = false;
    }
    identityRef.current = next;
  }, [boardId, laneName, filename, flushPendingSave]);

  // Final-chance flush on real unmount (route exit, not in-route navigation).
  const flushRef = useRef(flushPendingSave);
  flushRef.current = flushPendingSave;
  useEffect(() => {
    return () => { void flushRef.current(); };
  }, []);

  useEffect(() => {
    if (!ticket.data) return;
    const serverBody = ticket.data.ticket.body;
    const serverUpdated = ticket.data.ticket.updated;
    if (bodyFocusedRef.current || dirty) {
      // Editor is active or has unsaved work — never overwrite. Only flag genuine
      // external writes (server diverging from what we last persisted). Trailing
      // whitespace differences come from markdown round-trips and aren't conflicts.
      // Also ignore snapshots older than our last persisted state — when typing
      // fast, an early refetch can resolve after a later save and would look like
      // a divergence even though it's just a stale echo.
      const isStale =
        lastPersistedUpdatedRef.current !== null &&
        serverUpdated < lastPersistedUpdatedRef.current;
      if (
        !isStale &&
        savesInFlightRef.current === 0 &&
        lastPersistedBodyRef.current !== null &&
        !bodiesEquivalent(serverBody, lastPersistedBodyRef.current) &&
        !conflictNotifiedRef.current
      ) {
        conflictNotifiedRef.current = true;
        toast.warning('Ticket changed on disk while you were editing — your next save will overwrite it.');
      }
      return;
    }
    setTitle(ticket.data.ticket.title);
    setState(ticket.data.ticket.state);
    setColor(ticket.data.ticket.color);
    setBody(serverBody);
    lastPersistedBodyRef.current = serverBody;
    lastPersistedUpdatedRef.current = serverUpdated;
    conflictNotifiedRef.current = false;
    setDirty(false);
  }, [ticket.data, dirty]);

  useEffect(() => {
    setTab('console');
  }, [runtime?.runtimeId]);

  const saveIfDirty = useCallback(async () => {
    if (!dirty) return;
    const id = identityRef.current;
    if (!id) return;
    await flushPendingSave();
    await performSave(id, { title, body, state, color });
  }, [dirty, flushPendingSave, performSave, title, body, state, color]);

  if (!boardId || !laneName || !filename) return null;
  if (ticket.isLoading) return <div className="p-8 text-slate-500">Loading ticket…</div>;
  if (!ticket.data) return <div className="p-8 text-red-400">Ticket not found.</div>;

  const states = lane.data?.lane.states ?? [];

  const stateName = states.find((s) => s.dir === ticket.data.ticket.state)?.name ?? ticket.data.ticket.state;
  const stateUrl = `/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(laneName)}/state/${encodeURIComponent(ticket.data.ticket.state)}`;

  const accent = color ?? '#6b7280';

  const ticketEditor = (
    <div className="p-6 h-full flex flex-col" style={{ border: `2px solid ${accent}` }}>
      <nav className="text-sm text-slate-400 mb-3 shrink-0 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <button className="hover:text-white" onClick={() => navigate(`/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(laneName)}`)}>{lane.data?.lane.displayName ?? laneName}</button>
          <span className="text-slate-600">/</span>
          <button className="hover:text-white" onClick={() => navigate(stateUrl)}>{stateName}</button>
        </span>
        <div className="flex items-center gap-2">
          <label className="text-slate-400">State</label>
          <select
            className="bg-slate-800 rounded px-2 py-1 text-sm"
            value={state}
            onChange={async (e) => {
              const newState = e.target.value;
              const id = identityRef.current;
              if (!id) return;
              setState(newState);
              // Flush any pending body save first so the two writes don't race
              // for the same file — flush carries the old state, then we send
              // the state change explicitly.
              await flushPendingSave();
              await performSave(id, { title, body, state: newState, color });
            }}
          >
            {states.map((s) => <option key={s.dir} value={s.dir}>{s.name}</option>)}
          </select>
        </div>
      </nav>
      <input
        className="w-full bg-slate-800 rounded px-3 py-2 text-lg font-medium mb-3 shrink-0"
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
        onBlur={saveIfDirty}
        onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 's' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.currentTarget.blur(); } }}
      />
      <MarkdownEditor
        value={body}
        onChange={debouncedSaveBody}
        onFocus={() => { bodyFocusedRef.current = true; }}
        onBlur={() => { bodyFocusedRef.current = false; void flushPendingSave(); }}
        className="flex-1 min-h-0 w-full bg-slate-800 rounded overflow-y-auto"
        placeholder="Write ticket description…"
      />

      <div className="mt-4 shrink-0 flex items-center justify-between">
        <button
          className="px-3 py-1 rounded bg-red-700 text-sm"
          onClick={async () => {
            if (!confirm('Delete this ticket?')) return;
            try { await del.mutateAsync(); toast.success('Deleted'); navigate(-1); }
            catch (err) { toast.error((err as Error).message); }
          }}
        >Delete Ticket</button>
        <div className="relative w-5 h-5">
          <input
            type="color"
            value={color ?? '#6b7280'}
            onChange={(e) => {
              const newColor = e.target.value;
              const id = identityRef.current;
              if (!id) return;
              setColor(newColor);
              void performSave(id, { title, body, state, color: newColor });
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title="Ticket accent color"
          />
          <div
            className="absolute inset-0 rounded-full border border-slate-600 pointer-events-none"
            style={{ backgroundColor: color ?? '#6b7280' }}
          />
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500 font-mono shrink-0 flex items-center gap-2">
        <span>{filename}</span>
        {ticket.data.ticket.absPath && (
          <button
            className="text-slate-500 hover:text-slate-300"
            title={`Copy path: ${ticket.data.ticket.absPath}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ticket.data!.ticket.absPath);
                toast.success('Path copied');
              } catch (err) { toast.error((err as Error).message); }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  const consolePane = (
    <div className="flex flex-col h-full bg-black" style={{ border: `2px solid ${accent}` }}>
      <div className="flex items-center gap-1 px-2 pt-1 bg-slate-900 shrink-0">
        <button
          className={`px-3 py-1 text-xs rounded-t inline-flex items-center gap-2 ${tab === 'console' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('console')}
        >
          {runtime && <RuntimeStatusDot status={runtime.status} />}
          <span>Console</span>
        </button>
        <button
          className={`px-3 py-1 text-xs rounded-t ${tab === 'context' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('context')}
        >Context</button>
        <div className="ml-auto flex items-center gap-2">
          {activeRuntime ? (
            <button
              className="rounded bg-red-700 px-3 py-1 text-xs"
              onClick={async () => {
                try { await term.mutateAsync(activeRuntime.runtimeId); }
                catch (err) { toast.error((err as Error).message); }
              }}
            >Release</button>
          ) : (
            <>
              <select
                className="bg-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                <option value="claude-opus-4-7">Opus 4.7</option>
                <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
              </select>
              <button
                className="rounded bg-emerald-700 px-3 py-1 text-xs"
                onClick={async () => {
                  try {
                    const res = await spawn.mutateAsync({ boardId, laneName, filename, model });
                    if (res.runtime.status === 'errored') {
                      toast.error(res.runtime.errorMessage ?? 'Failed to start agent');
                    }
                  } catch (err) { toast.error((err as Error).message); }
                }}
              >Start</button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'console' ? (
          runtime ? (
            <div className="h-full p-1">
              <XtermHost runtimeId={runtime.runtimeId} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              No agent running.
            </div>
          )
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {runtime?.preamble ? (
              <pre className="text-slate-300 text-xs whitespace-pre-wrap font-mono">{runtime.preamble}</pre>
            ) : (
              <span className="text-slate-500 text-sm">No context available.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full">
      <ResizableSplit
        left={ticketEditor}
        right={consolePane}
        defaultSplit={0.5}
        minLeft={300}
        storageKey={`ticket-split:${filename}`}
        minRight={300}
      />
    </div>
  );
}
