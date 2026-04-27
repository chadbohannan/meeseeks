import { useState } from 'react';
import { Modal } from './Modal.js';
import { useCreateLane } from '../hooks/queries.js';
import { toast } from 'sonner';

interface Props { boardId: string; open: boolean; onClose(): void }

const DEFAULT_STATES = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'in-progress', name: 'In progress' },
  { dir: 'done', name: 'Done' },
];

export function NewLaneModal({ boardId, open, onClose }: Props) {
  const [name, setName] = useState('');
  const create = useCreateLane(boardId);
  return (
    <Modal title="New lane" open={open} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await create.mutateAsync({ name, states: DEFAULT_STATES });
            toast.success('Lane created');
            onClose();
            setName('');
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="block">
          <span className="text-sm text-slate-400">Name</span>
          <input className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <p className="text-xs text-slate-500">States default to Todo / In progress / Done. Edit later by hand in <code>lane.yaml</code>.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded bg-slate-700">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-blue-600" disabled={create.isPending}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
