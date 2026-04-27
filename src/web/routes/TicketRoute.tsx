import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLane, useTicket, usePatchTicket, useDeleteTicket } from '../hooks/queries.js';
import { toast } from 'sonner';

export function TicketRoute() {
  const { boardId, laneName, filename } = useParams<{ boardId: string; laneName: string; filename: string }>();
  const lane = useLane(boardId, laneName);
  const ticket = useTicket(boardId, laneName, filename);
  const patch = usePatchTicket(boardId!, laneName!, filename!);
  const del = useDeleteTicket(boardId!, laneName!, filename!);
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!ticket.data) return;
    if (dirty) return;
    setTitle(ticket.data.ticket.title);
    setBody(ticket.data.ticket.body);
    setState(ticket.data.ticket.state);
  }, [ticket.data, dirty]);

  if (!boardId || !laneName || !filename) return null;
  if (ticket.isLoading) return <div className="p-8 text-slate-500">Loading ticket…</div>;
  if (!ticket.data) return <div className="p-8 text-red-400">Ticket not found.</div>;

  const states = lane.data?.lane.states ?? [];

  return (
    <div className="p-6 max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-400 mb-4">← Back</button>
      <input
        className="w-full bg-slate-800 rounded px-3 py-2 text-lg font-medium mb-3"
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
      />
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400">State</label>
        <select
          className="bg-slate-800 rounded px-2 py-1 text-sm"
          value={state}
          onChange={(e) => { setState(e.target.value); setDirty(true); }}
        >
          {states.map((s) => <option key={s.dir} value={s.dir}>{s.name}</option>)}
        </select>
        <span className="text-xs text-slate-500 font-mono ml-auto">{filename}</span>
      </div>
      <textarea
        className="w-full h-96 bg-slate-800 rounded px-3 py-2 font-mono text-sm"
        value={body}
        onChange={(e) => { setBody(e.target.value); setDirty(true); }}
      />
      <div className="flex justify-between items-center mt-4">
        <button
          className="px-3 py-1 rounded bg-red-700 text-sm"
          onClick={async () => {
            if (!confirm('Delete this ticket?')) return;
            try { await del.mutateAsync(); toast.success('Deleted'); navigate(-1); }
            catch (err) { toast.error((err as Error).message); }
          }}
        >Delete</button>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-slate-700 text-sm"
            onClick={() => { setDirty(false); }}
            disabled={!dirty}
          >Discard</button>
          <button
            className="px-3 py-1 rounded bg-blue-600 text-sm"
            disabled={!dirty || patch.isPending}
            onClick={async () => {
              try {
                await patch.mutateAsync({ title, body, state });
                setDirty(false);
                toast.success('Saved');
              } catch (err) { toast.error((err as Error).message); }
            }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
