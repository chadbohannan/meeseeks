import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLane, useTicket, usePatchTicket, useDeleteTicket, useSpawnRuntime, useTerminateRuntime } from '../hooks/queries.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { RuntimeStatusDot } from '../components/RuntimeStatusDot.js';
import { ResizableSplit } from '../components/ResizableSplit.js';
import { XtermHost } from '../components/console/xterm-host.js';
import { toast } from 'sonner';
import { Markdown } from '../components/Markdown.js';

export function TicketRoute() {
  const { boardId, laneName, filename } = useParams<{ boardId: string; laneName: string; filename: string }>();
  const lane = useLane(boardId, laneName);
  const ticket = useTicket(boardId, laneName, filename);
  const patch = usePatchTicket(boardId!, laneName!, filename!);
  const del = useDeleteTicket(boardId!, laneName!, filename!);
  const navigate = useNavigate();
  const spawn = useSpawnRuntime();
  const term = useTerminateRuntime();
  const runtime = useRuntimesStore((s) =>
    Object.values(s.byId).find(r =>
      r.ticketRef.boardId === boardId && r.ticketRef.laneName === laneName && r.ticketRef.filename === filename));

  const activeRuntime =
    runtime && !['exited', 'errored', 'terminating'].includes(runtime.status)
      ? runtime
      : null;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'console' | 'context'>('console');
  const [model, setModel] = useState('claude-sonnet-4-6');

  useEffect(() => {
    if (!ticket.data) return;
    if (dirty) return;
    setTitle(ticket.data.ticket.title);
    setBody(ticket.data.ticket.body);
    setState(ticket.data.ticket.state);
    setColor(ticket.data.ticket.color);
  }, [ticket.data, dirty]);

  useEffect(() => {
    setTab('console');
  }, [runtime?.runtimeId]);

  const saveIfDirty = async () => {
    if (!dirty) return;
    try {
      await patch.mutateAsync({ title, body, state, color });
      setDirty(false);
    } catch (err) { toast.error((err as Error).message); }
  };

  if (!boardId || !laneName || !filename) return null;
  if (ticket.isLoading) return <div className="p-8 text-slate-500">Loading ticket…</div>;
  if (!ticket.data) return <div className="p-8 text-red-400">Ticket not found.</div>;

  const states = lane.data?.lane.states ?? [];

  const stateName = states.find((s) => s.dir === ticket.data.ticket.state)?.name ?? ticket.data.ticket.state;
  const stateUrl = `/boards/${encodeURIComponent(boardId)}/lanes/${encodeURIComponent(laneName)}/state/${encodeURIComponent(ticket.data.ticket.state)}`;

  const accent = color ?? '#6b7280';

  const ticketEditor = (
    <div className="p-6 max-w-3xl h-full flex flex-col" style={{ border: `2px solid ${accent}` }}>
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
              setState(newState);
              try {
                await patch.mutateAsync({ title, body, state: newState, color });
              } catch (err) { toast.error((err as Error).message); }
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
      />
      <div className="flex items-center gap-2 mb-3 shrink-0">
        {activeRuntime ? (
          <>
            <RuntimeStatusDot status={activeRuntime.status} />
            <span className="text-sm">{activeRuntime.status}</span>
            <button
              className="rounded bg-red-700 px-3 py-1 text-sm ml-auto"
              onClick={async () => {
                try { await term.mutateAsync(activeRuntime.runtimeId); }
                catch (err) { toast.error((err as Error).message); }
              }}
            >Release</button>
          </>
        ) : (
          <>
            {runtime && (runtime.status === 'exited' || runtime.status === 'errored') && (
              <div className="flex items-center gap-2">
                <RuntimeStatusDot status={runtime.status} />
                <span className="text-sm text-slate-400">
                  {runtime.status === 'errored'
                    ? runtime.errorMessage ?? 'Agent errored'
                    : `Agent exited (code ${runtime.exitCode ?? '?'})`}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
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
                className="rounded bg-emerald-700 px-3 py-1 text-sm"
                onClick={async () => {
                  try {
                    const res = await spawn.mutateAsync({ boardId, laneName, filename, model });
                    if (res.runtime.status === 'errored') {
                      toast.error(res.runtime.errorMessage ?? 'Failed to start agent');
                    }
                  } catch (err) { toast.error((err as Error).message); }
                }}
              >Start</button>
            </div>
          </>
        )}
      </div>

      {editing ? (
        <textarea
          className="flex-1 min-h-0 w-full bg-slate-800 rounded px-3 py-2 font-mono text-sm overflow-y-auto resize-none"
          value={body}
          onChange={(e) => { setBody(e.target.value); setDirty(true); }}
          onBlur={async () => { await saveIfDirty(); setEditing(false); }}
          autoFocus
        />
      ) : (
        <div
          className="flex-1 min-h-0 w-full bg-slate-800 rounded px-3 py-2 overflow-y-auto cursor-pointer hover:ring-1 hover:ring-slate-600"
          onClick={() => setEditing(true)}
        >
          <Markdown>{body}</Markdown>
        </div>
      )}

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
              setColor(e.target.value);
              patch.mutate({ title, body, state, color: e.target.value }).catch(() => {});
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
      <div className="mt-2 text-xs text-slate-500 font-mono shrink-0">{filename}</div>
    </div>
  );

  const consolePane = (
    <div className="flex flex-col h-full bg-black" style={{ border: `2px solid ${accent}` }}>
      {runtime ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-sm shrink-0">
            <RuntimeStatusDot status={runtime.status} />
            <span className="font-mono text-xs">{runtime.ticketRef.filename}</span>
            {(runtime.status === 'exited' || runtime.status === 'errored' || runtime.status === 'terminating') && (
              <span className="ml-auto text-xs text-slate-500">session ended</span>
            )}
          </div>
          <div className="flex gap-1 px-2 pt-1 bg-slate-900 shrink-0">
            <button
              className={`px-3 py-1 text-xs rounded-t ${tab === 'console' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setTab('console')}
            >Console</button>
            <button
              className={`px-3 py-1 text-xs rounded-t ${tab === 'context' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setTab('context')}
            >Context</button>
          </div>
          <div className="flex-1 min-h-0">
            {tab === 'console' ? (
              <div className="h-full p-1">
                <XtermHost runtimeId={runtime.runtimeId} />
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-4">
                {runtime.preamble ? (
                  <pre className="text-slate-300 text-xs whitespace-pre-wrap font-mono">{runtime.preamble}</pre>
                ) : (
                  <span className="text-slate-500 text-sm">No context available.</span>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          No agent running. Spawn one to see the console here.
        </div>
      )}
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
