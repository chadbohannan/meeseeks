import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import {
  usePrompts, usePrompt, usePutPrompt, useDeletePrompt, useRunPrompt, usePromptLogs,
} from '../hooks/queries.js';
import type { PromptRunLog } from '@shared/api.js';
import { api } from '../lib/api.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { usePromptsStore } from '../store/prompts.js';
import { MarkdownEditor } from './MarkdownEditor.js';
import { RuntimeStatusDot } from './RuntimeStatusDot.js';

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

function slugify(name: string): string {
  const trimmed = name.trim().replace(/\.md$/i, '');
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return (slug || 'untitled') + '.md';
}

interface Props { boardId: string }

export function PromptsEditor({ boardId }: Props) {
  const { data, isLoading } = usePrompts(boardId);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const files = data?.prompts ?? [];

  const handleCreate = async () => {
    const slug = slugify(newName);
    if (files.some(f => f.name === slug)) {
      setCreateError('A prompt with this name already exists');
      return;
    }
    try {
      await api.putPrompt(boardId, slug, { body: '' });
      setSelected(slug);
      setCreating(false);
      setNewName('');
      setCreateError(null);
      toast.success('Prompt created');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) return <div className="p-4 text-slate-400">Loading prompts…</div>;

  return (
    <div className="flex h-full bg-slate-900">
      <div className="w-44 border-r border-slate-700 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 && !creating && (
            <div className="p-4 text-sm text-slate-500">No prompts yet.</div>
          )}
          {files.map(f => (
            <button
              key={f.name}
              onClick={() => setSelected(f.name)}
              className={`w-full px-4 py-2 text-left text-sm border-b border-slate-800/50 ${
                selected === f.name ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="font-mono truncate">{f.name}</div>
            </button>
          ))}
          {creating ? (
            <div className="p-3 border-b border-slate-800/50 bg-slate-800">
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
                placeholder="weekly report"
                className="w-full px-2 py-1 mb-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                autoFocus
              />
              <div className="text-xs text-slate-500 mb-2 font-mono truncate">{slugify(newName)}</div>
              {createError && <div className="text-xs text-red-400 mb-2">{createError}</div>}
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={!newName.trim()}
                  className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white text-xs rounded">Create</button>
                <button onClick={() => { setCreating(false); setNewName(''); setCreateError(null); }}
                  className="flex-1 px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded">Cancel</button>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/50 text-slate-400"
              onClick={() => { setCreating(true); setNewName(''); setCreateError(null); }}
            >
              <span className="text-sm">+ New Prompt</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selected ? (
          <PromptEditor key={selected} boardId={boardId} name={selected} onDeleted={() => setSelected(null)} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select a prompt to edit or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

function PromptEditor({ boardId, name, onDeleted }: { boardId: string; name: string; onDeleted: () => void }) {
  const { data, isLoading } = usePrompt(boardId, name);
  const put = usePutPrompt(boardId, name);
  const del = useDeletePrompt(boardId);
  const run = useRunPrompt(boardId);
  const openModal = usePromptsStore((s) => s.openModal);
  const runtimes = useRuntimesStore((s) => s.byId);
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [tab, setTab] = useState<'editor' | 'log'>('editor');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyInitializedRef = useRef(false);

  const liveRuntime = useMemo(() => Object.values(runtimes).find(r =>
    r.kind === 'prompt' && r.promptRef?.boardId === boardId && r.promptRef?.name === name &&
    r.status !== 'exited' && r.status !== 'errored'
  ), [runtimes, boardId, name]);

  useEffect(() => {
    if (!data) return;
    // Body is owned by the editor once initialized — don't let refetches overwrite
    // what the user is typing (same pattern as TicketRoute).
    if (!bodyInitializedRef.current) {
      bodyInitializedRef.current = true;
      setBody(data.prompt.body);
    }
  }, [data]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const scheduleSave = (next: string) => {
    setBody(next);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await put.mutateAsync(next);
        setDirty(false);
      } catch (err) { toast.error((err as Error).message); }
    }, 800);
  };

  const handleStart = async () => {
    try {
      if (dirty) {
        await put.mutateAsync(body);
        setDirty(false);
      }
      const res = await run.mutateAsync({ name, model });
      openModal(res.runtime.runtimeId);
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await del.mutateAsync(name);
      onDeleted();
      toast.success('Prompt deleted');
    } catch (err) { toast.error((err as Error).message); }
  };

  if (isLoading) return <div className="p-6 text-slate-400">Loading…</div>;
  if (!data) return <div className="p-6 text-red-400">Failed to load prompt</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-2 pt-1 bg-slate-900 border-b border-slate-700 shrink-0">
        <button
          className={`px-3 py-1 text-xs rounded-t inline-flex items-center gap-2 ${tab === 'editor' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('editor')}
        >
          {liveRuntime && <RuntimeStatusDot status={liveRuntime.status} />}
          <span className="font-mono">{name}</span>
        </button>
        <button
          className={`px-3 py-1 text-xs rounded-t ${tab === 'log' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('log')}
        >Log</button>
        <div className="ml-auto flex items-center gap-2 pb-1">
          <select
            className="bg-slate-800 rounded px-2 py-1 text-xs text-slate-300"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!!liveRuntime}
          >
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {liveRuntime ? (
            <button
              onClick={() => openModal(liveRuntime.runtimeId)}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded"
            >Open</button>
          ) : (
            <button
              onClick={handleStart}
              disabled={run.isPending}
              className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs rounded"
            >Start</button>
          )}
          <button
            onClick={handleDelete}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
          >Delete</button>
        </div>
      </div>
      {tab === 'editor' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <MarkdownEditor
            value={body}
            onChange={scheduleSave}
            className="bg-slate-800 border border-slate-700 rounded min-h-96"
            placeholder="Write prompt content…"
          />
        </div>
      ) : (
        <RunLog boardId={boardId} name={name} />
      )}
    </div>
  );
}

function RunLog({ boardId, name }: { boardId: string; name: string }) {
  const { data, isLoading } = usePromptLogs(boardId, name);
  const [expanded, setExpanded] = useState<string | null>(null);
  const logs = data?.logs ?? [];

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">Loading…</div>;
  if (logs.length === 0) return <div className="p-6 text-slate-500 text-sm">No runs recorded yet.</div>;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-800">
      {logs.map((log) => (
        <RunLogEntry
          key={log.runtimeId}
          log={log}
          open={expanded === log.runtimeId}
          onToggle={() => setExpanded(expanded === log.runtimeId ? null : log.runtimeId)}
        />
      ))}
    </div>
  );
}

function RunLogEntry({ log, open, onToggle }: { log: PromptRunLog; open: boolean; onToggle: () => void }) {
  const exitedAt = new Date(log.exitedAt);
  const startedAt = new Date(log.startedAt);
  const durationSec = Math.round((exitedAt.getTime() - startedAt.getTime()) / 1000);

  return (
    <div className="text-xs font-mono">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 text-left"
      >
        <span className={log.status === 'exited' ? 'text-emerald-400' : 'text-red-400'}>
          {log.status === 'exited' ? '✓' : '✗'}
        </span>
        <span className="text-slate-300">{exitedAt.toLocaleString()}</span>
        <span className="text-slate-500">{durationSec}s</span>
        {log.errorMessage && <span className="text-red-400 truncate">{log.errorMessage}</span>}
        <span className="ml-auto text-slate-600">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <pre className="px-4 pb-4 pt-1 text-slate-300 whitespace-pre-wrap break-words bg-slate-950 text-xs leading-relaxed">
          {log.output || '(no output)'}
        </pre>
      )}
    </div>
  );
}
