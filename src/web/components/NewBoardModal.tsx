import { useState } from 'react';
import { Modal } from './Modal.js';
import { useCreateBoard } from '../hooks/queries.js';
import { toast } from 'sonner';

interface Props { open: boolean; onClose(): void }

export function NewBoardModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const create = useCreateBoard();
  return (
    <Modal title="New board" open={open} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try { await create.mutateAsync({ name }); toast.success('Board created'); onClose(); setName(''); }
          catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="block">
          <span className="text-sm text-slate-400">Name</span>
          <input className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded bg-slate-700">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-blue-600" disabled={create.isPending}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
