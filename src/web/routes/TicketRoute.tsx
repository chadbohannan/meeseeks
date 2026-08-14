import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkflow, useTicket, useDeleteTicket, useSpawnRuntime, useTerminateRuntime, useModels, useProjects } from '../hooks/queries.js';
import { ProjectSelect, findProject } from '../components/ProjectControls.js';
import { PermissionsPanel } from '../components/PermissionsPanel.js';
import { useUi } from '../store/ui.js';
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

// The persistent identity of a ticket (board + workflow + filename). Saves are
// authored against an Identity captured at edit time, so an in-flight or
// debounced save always lands at the file the user was editing — even if the
// route has since navigated to a different ticket.
type Identity = { boardId: string; workflowName: string; filename: string };
function sameIdentity(a: Identity, b: Identity): boolean {
  return a.boardId === b.boardId && a.workflowName === b.workflowName && a.filename === b.filename;
}

export function TicketRoute() {
  const { boardId, workflowName, filename } = useParams<{ boardId: string; workflowName: string; filename: string }>();
  const workflow = useWorkflow(boardId, workflowName);
  const ticket = useTicket(boardId, workflowName, filename);
  const del = useDeleteTicket(boardId!, workflowName!, filename!);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const spawn = useSpawnRuntime();
  const term = useTerminateRuntime();
  const runtime = useRuntimesStore((s) =>
    Object.values(s.byId).find(r =>
      r.kind === 'ticket' &&
      r.ticketRef?.boardId === boardId && r.ticketRef?.workflowName === workflowName && r.ticketRef?.filename === filename));

  const activeRuntime =
    runtime && !['exited', 'errored', 'terminating'].includes(runtime.status)
      ? runtime
      : null;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [project, setProject] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'console' | 'context' | 'permissions'>('console');
  const { data: projectsData } = useProjects();
  const setLastProject = useUi(s => s.setLastProject);
  const { data: modelsData } = useModels();
  const models = modelsData?.models ?? [];
  const [model, setModel] = useState('');
  // Default to the first available model once the list loads (or if the current
  // selection is no longer offered).
  useEffect(() => {
    if (models.length > 0 && !models.some(m => m.value === model)) {
      setModel(models[0]!.value);
    }
  }, [models, model]);
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

  // The identity (board+workflow+filename) currently displayed. Updated by the
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
      const res = await api.patchTicket(identity.boardId, identity.workflowName, identity.filename, fields);
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
      qc.invalidateQueries({ queryKey: ['tickets', identity.boardId, identity.workflowName] });
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

  // Identity-change handler. When the route's (boardId, workflowName, filename)
  // tuple shifts — e.g. user clicks a different ticket — flush any pending
  // save against the outgoing identity, then reset local state so the load
  // effect below can populate the new ticket fresh. This replaces both the
  // unmount-only flush (which never fired on in-route navigation) and the
  // dirty-bail in the load effect (which used to strand the old body under
  // the new ticket's header).
  useEffect(() => {
    if (!boardId || !workflowName || !filename) return;
    const next: Identity = { boardId, workflowName, filename };
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
  }, [boardId, workflowName, filename, flushPendingSave]);

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
    setProject(ticket.data.ticket.project);
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

  if (!boardId || !workflowName || !filename) return null;
  if (ticket.isLoading) return <div className="p-8 text-slate-500">Loading ticket…</div>;
  if (!ticket.data) return <div className="p-8 text-red-400">Ticket not found.</div>;

  const states = workflow.data?.workflow.states ?? [];

  const stateName = states.find((s) => s.dir === ticket.data.ticket.state)?.name ?? ticket.data.ticket.state;
  const stateUrl = `/boards/${encodeURIComponent(boardId)}/workflows/${encodeURIComponent(workflowName)}/state/${encodeURIComponent(ticket.data.ticket.state)}`;

  const accent = color ?? '#6b7280';

  // Assignment is optional, but running is not: the spawn route rejects an
  // unassigned ticket or a slug whose project no longer exists, because neither
  // yields a root to point the agent at. Mirror that rule in the affordance so
  // the failure is visible before the click rather than as a toast after it.
  const { unknown: projectUnknown } = findProject(projectsData?.projects, project);
  const startBlockedReason = !project
    ? 'Assign a project before starting an agent'
    : projectUnknown
      ? `Project "${project}" no longer exists — reassign this ticket`
      : null;
  const canStart = startBlockedReason === null;

  const ticketEditor = (
    <div className="p-6 h-full flex flex-col" style={{ border: `2px solid ${accent}` }}>
      <nav className="text-sm text-slate-400 mb-3 shrink-0 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <button className="hover:text-white" onClick={() => navigate(`/boards/${encodeURIComponent(boardId)}/workflows/${encodeURIComponent(workflowName)}`)}>{workflow.data?.workflow.displayName ?? workflowName}</button>
          <span className="text-slate-600">/</span>
          <button className="hover:text-white" onClick={() => navigate(stateUrl)}>{stateName}</button>
        </span>
        <div className="flex items-center gap-2">
          <label className="text-slate-400">Project</label>
          <ProjectSelect
            value={project}
            // The project is captured at spawn time — it becomes --add-dir, a
            // preamble sentence, and MEESEEKS_PROJECT_ROOT in the live process.
            // Reassigning mid-session would change the ticket and badge while
            // the agent kept working in the old codebase, so lock it until the
            // runtime is released.
            disabled={!!activeRuntime}
            title={activeRuntime
              ? 'Release the agent before reassigning — a running session is bound to the project it started with'
              : undefined}
            onChange={async (next) => {
              const id = identityRef.current;
              if (!id) return;
              setProject(next);
              if (next) setLastProject(next);
              await flushPendingSave();
              // An empty string clears the assignment server-side; undefined
              // would mean "leave unchanged".
              await performSave(id, { title, body, state, color, project: next ?? '' });
              qc.invalidateQueries({ queryKey: ['ticket-permissions', id.boardId, id.workflowName, id.filename] });
            }}
          />
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
        <button
          className={`px-3 py-1 text-xs rounded-t ${tab === 'permissions' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('permissions')}
        >Permissions</button>
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
                {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <button
                className={`rounded px-3 py-1 text-xs ${canStart ? 'bg-emerald-700' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                disabled={!canStart}
                title={startBlockedReason ?? 'Start an agent on this ticket'}
                onClick={async () => {
                  try {
                    const res = await spawn.mutateAsync({ boardId, workflowName, filename, model });
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
        ) : tab === 'context' ? (
          <div className="h-full overflow-y-auto p-4">
            {runtime?.preamble ? (
              <pre className="text-slate-300 text-xs whitespace-pre-wrap font-mono">{runtime.preamble}</pre>
            ) : (
              <span className="text-slate-500 text-sm">No context available.</span>
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            <PermissionsPanel
              boardId={boardId}
              workflowName={workflowName}
              filename={filename}
              active={tab === 'permissions'}
            />
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
