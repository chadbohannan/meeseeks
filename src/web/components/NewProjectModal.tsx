import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from './Modal.js';
import { useCreateProject } from '../hooks/queries.js';
import { DetectionChecklist, type AcceptedDetections } from './DetectionChecklist.js';
import type { PermissionsConfig } from '@shared/types.js';

interface Props {
  open: boolean;
  onClose(): void;
  /** Called with the new project's id so the caller can select it. */
  onCreated?(projectId: string): void;
}

export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [root, setRoot] = useState('');
  // Accepted proposals are held here until the form is submitted. Detection
  // runs before the project exists, so there is nothing to write them to yet.
  const [accepted, setAccepted] = useState<AcceptedDetections | null>(null);
  const create = useCreateProject();

  const close = () => { setName(''); setRoot(''); setAccepted(null); onClose(); };

  return (
    <Modal title="New project" open={open} onClose={close}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const permissions: PermissionsConfig | undefined = accepted
              ? { allowedPaths: [], allowedTools: accepted.allowedTools, deniedTools: [] }
              : undefined;
            // Omitting permissions entirely lets storage apply the starter set;
            // accepted proposals replace it, since they already include read
            // access to the root and were reviewed one by one.
            const res = await create.mutateAsync({
              name,
              root,
              ...(permissions ? { permissions } : {}),
              ...(accepted?.contextFile ? { contextFile: accepted.contextFile } : {}),
            });
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
            The codebase this project points at. Context and permissions can also be added after creating it.
          </span>
        </label>
        <DetectionChecklist root={root} onAccept={setAccepted} />
        {accepted && (
          <p className="text-[11px] text-emerald-400">
            {accepted.allowedTools.length} grant{accepted.allowedTools.length === 1 ? '' : 's'}
            {accepted.contextFile ? ' and a context file' : ''} will be written when you create it.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={close} className="px-3 py-1 rounded bg-slate-700">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-blue-600" disabled={create.isPending}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
