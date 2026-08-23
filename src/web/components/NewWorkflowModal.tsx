import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal.js';
import { useCreateWorkflow, useWorkflows } from '../hooks/queries.js';
import { StatesEditor } from './StatesEditor.js';
import type { WorkflowState } from '@shared/types.js';
import { toast } from 'sonner';

interface Props { open: boolean; onClose(): void }

const DEFAULT_STATES: WorkflowState[] = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'in-progress', name: 'In progress' },
  { dir: 'done', name: 'Done' },
];

export function NewWorkflowModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  // States are configured here rather than after the fact: creating the
  // directories is what the states list actually does, and renaming a state
  // later orphans the tickets already filed under the old folder.
  const [states, setStates] = useState<WorkflowState[]>(DEFAULT_STATES);
  // Configuration only — the source's states and PROCESS.md are deliberately
  // not copied, so the states editor above stays the user's own choice.
  const [copyFrom, setCopyFrom] = useState('');
  const workflows = useWorkflows();
  const create = useCreateWorkflow();
  const navigate = useNavigate();

  const reset = () => { setName(''); setStates(DEFAULT_STATES); setCopyFrom(''); };
  const close = () => { reset(); onClose(); };

  return (
    <Modal title="New workflow" open={open} onClose={close}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (states.length === 0) { toast.error('At least one state is required'); return; }
          try {
            const res = await create.mutateAsync({
              name, states, ...(copyFrom ? { copyFrom } : {}),
            });
            toast.success('Workflow created');
            close();
            navigate(`/workflows/${encodeURIComponent(res.workflow.workflowName)}`);
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="block">
          <span className="text-sm text-slate-400">Name</span>
          <input className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-400">Copy configuration from</span>
          <select
            className="w-full bg-slate-800 rounded px-2 py-1 mt-1 text-sm"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
          >
            <option value="">Nothing — start fresh</option>
            {(workflows.data?.workflows ?? [])
              .filter(w => w.available)
              .map(w => (
                <option key={w.workflowName} value={w.workflowName}>{w.displayName}</option>
              ))}
          </select>
          <span className="block text-[11px] text-slate-500 mt-1">
            Copies that workflow&apos;s runtime block and permissions. States and its process
            document are not copied.
          </span>
        </label>
        <div>
          <span className="text-sm text-slate-400">States</span>
          <div className="mt-1">
            <StatesEditor
              states={states}
              onUpdate={(idx, field, value) => {
                const next = [...states];
                next[idx] = { ...next[idx]!, [field]: value };
                setStates(next);
              }}
              onAdd={() => setStates([...states, { dir: '', name: '' }])}
              onRemove={(idx) => setStates(states.filter((_, i) => i !== idx))}
              onMove={(from, to) => {
                if (from === to || to < 0 || to >= states.length) return;
                const next = [...states];
                const [item] = next.splice(from, 1);
                if (item) next.splice(to, 0, item);
                setStates(next);
              }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={close} className="px-3 py-1 rounded bg-slate-700">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-blue-600" disabled={create.isPending}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
