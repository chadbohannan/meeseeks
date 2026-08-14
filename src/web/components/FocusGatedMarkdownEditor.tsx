import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { MarkdownEditor } from './MarkdownEditor.js';

// Treat bodies as equivalent if they only differ in trailing whitespace —
// server round-trips through markdown serializers can add/remove a trailing
// newline, which would otherwise look like an external edit.
function bodiesEquivalent(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd();
}

interface FocusGatedMarkdownEditorProps {
  serverValue: string | null;
  save: (content: string) => Promise<unknown>;
  loading?: boolean;
  notFound?: boolean;
  notFoundLabel?: string;
  externalLabel: string;
  savedToast?: string;
  className?: string;
  placeholder?: string;
}

// Editor whose local state is the source of truth while focused or dirty.
// Server values are only adopted when both unfocused and clean. External writes
// during an active edit produce a one-shot toast rather than overwriting.
export function FocusGatedMarkdownEditor({
  serverValue, save, loading, notFound, notFoundLabel,
  externalLabel, savedToast, className, placeholder,
}: FocusGatedMarkdownEditorProps) {
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const focusedRef = useRef(false);
  const lastPersistedRef = useRef<string | null>(null);
  const conflictNotifiedRef = useRef(false);
  const bodyRef = useRef('');
  bodyRef.current = body;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const pendingBodyRef = useRef<string | null>(null);
  // See TicketRoute: the filesystem watcher often delivers a refetch before our
  // own PATCH resolves, so lastPersistedRef can be stale at the moment the
  // server snapshot arrives. Suppress conflict toasts while any save is open.
  const savesInFlightRef = useRef(0);

  useEffect(() => {
    if (serverValue === null) return;
    if (focusedRef.current || dirty) {
      if (
        savesInFlightRef.current === 0 &&
        lastPersistedRef.current !== null &&
        !bodiesEquivalent(serverValue, lastPersistedRef.current) &&
        !conflictNotifiedRef.current
      ) {
        conflictNotifiedRef.current = true;
        toast.warning(externalLabel);
      }
      return;
    }
    setBody(serverValue);
    lastPersistedRef.current = serverValue;
    conflictNotifiedRef.current = false;
  }, [serverValue, dirty, externalLabel]);

  const performSave = useCallback(async (md: string) => {
    savesInFlightRef.current++;
    try {
      await save(md);
      lastPersistedRef.current = md;
      conflictNotifiedRef.current = false;
      if (bodyRef.current === md) setDirty(false);
      if (savedToast) toast.success(savedToast);
    } catch (err) { toast.error((err as Error).message); }
    finally { savesInFlightRef.current--; }
  }, [save, savedToast]);

  const flushPendingSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = pendingBodyRef.current;
    pendingBodyRef.current = null;
    if (pending !== null) void performSave(pending);
  }, [performSave]);

  const flushRef = useRef(flushPendingSave);
  flushRef.current = flushPendingSave;
  useEffect(() => {
    return () => { flushRef.current(); };
  }, []);

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (notFound) return <div className="p-6 text-red-400">{notFoundLabel ?? 'Not found.'}</div>;

  return (
    <MarkdownEditor
      value={body}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; flushPendingSave(); }}
      onChange={(md) => {
        setBody(md);
        setDirty(true);
        pendingBodyRef.current = md;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          const pending = pendingBodyRef.current;
          pendingBodyRef.current = null;
          if (pending !== null) void performSave(pending);
        }, 3000);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
}
