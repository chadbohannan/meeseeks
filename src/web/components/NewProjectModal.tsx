import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from './Modal.js';
import { useCreateProject } from '../hooks/queries.js';

interface Props {
  open: boolean;
  onClose(): void;
  /** Called with the new project's id so the caller can select it. */
  onCreated?(projectId: string): void;
}

export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [root, setRoot] = useState('');
  const create = useCreateProject();

  const close = () => { setName(''); setRoot(''); onClose(); };

  return (
    <Modal title="New project" open={open} onClose={close}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await create.mutateAsync({ name, root });
            toast.success('Project created');
            onCreated?.(res.project.projectId);
            close();
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="block">
          <span className="text-sm text-slate-400">Name</span>
          <input
            className="w-full bg-slate-800 rounded px-2 py-1 mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="meeseeks"
            required
            autoFocus
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-400">Repository root</span>
          <input
            className="w-full bg-slate-800 rounded px-2 py-1 mt-1 font-mono text-sm"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="~/workspace/meeseeks"
            required
          />
          <span className="block text-[11px] text-slate-500 mt-1">
            The codebase this project points at. Context and permissions can be added after creating it.
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={close} className="px-3 py-1 rounded bg-slate-700">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-blue-600" disabled={create.isPending}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
