import { useState } from 'react';
import { useParams, useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkflow, usePatchWorkflow, useDeleteWorkflow } from '../hooks/queries.js';
import type { WorkflowState, RuntimeConfig } from '@shared/types.js';
import { SkillsEditor } from '../components/SkillsEditor.js';
import { BinEditor } from '../components/BinEditor.js';
import { PromptsEditor } from '../components/PromptsEditor.js';
import { StatesEditor } from '../components/StatesEditor.js';
import { FocusGatedMarkdownEditor } from '../components/FocusGatedMarkdownEditor.js';

type Section = 'states' | 'process' | 'runtime' | 'prompts' | 'skills' | 'bin';

const WORKFLOW_SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'states', label: 'States' },
  { key: 'process', label: 'PROCESS.md' },
  { key: 'runtime', label: 'Runtime' },
];

// These edit files at the workspace root, shared by every workflow. They live
// here because this is the only settings surface, but they are labelled by what
// they actually edit so the scope is legible from the label alone.
const WORKSPACE_SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'prompts', label: 'Prompts' },
  { key: 'skills', label: '.claude/skills' },
  { key: 'bin', label: '.claude/bin' },
];

export function WorkflowEditorRoute() {
  const { workflowName } = useParams<{ workflowName: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get('section') as Section | null) ?? 'states';

  if (!workflowName) return <Navigate to="/workflows" replace />;

  return (
    <div className="flex h-full">
      <div className="w-52 border-r border-slate-700 flex flex-col shrink-0">
        <SectionGroup
          heading={workflowName}
          items={WORKFLOW_SECTIONS}
          active={section}
          onSelect={(k) => setSearchParams({ section: k })}
        />
        <SectionGroup
          heading="Workspace"
          items={WORKSPACE_SECTIONS}
          active={section}
          onSelect={(k) => setSearchParams({ section: k })}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {section === 'prompts' ? <PromptsEditor />
          : section === 'skills' ? <SkillsEditor />
          : section === 'bin' ? <BinEditor />
          : <WorkflowConfig workflowName={workflowName} section={section} />}
      </div>
    </div>
  );
}

function SectionGroup({
  heading, items, active, onSelect,
}: {
  heading: string;
  items: Array<{ key: Section; label: string }>;
  active: Section;
  onSelect: (key: Section) => void;
}) {
  return (
    <div className="border-b border-slate-800">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">
        {heading}
      </div>
      {items.map(item => (
        <div
          key={item.key}
          className={`px-4 py-2 cursor-pointer text-sm border-b border-slate-800/50 ${
            active === item.key ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/50'
          }`}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

function WorkflowConfig({ workflowName, section }: { workflowName: string; section: Section }) {
  const workflow = useWorkflow(workflowName);
  const patch = usePatchWorkflow(workflowName);
  const del = useDeleteWorkflow(workflowName);
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [states, setStates] = useState<WorkflowState[] | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  if (workflow.isLoading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!workflow.data) return <div className="p-6 text-red-400">Workflow not found.</div>;

  const wf = workflow.data.workflow;
  const currentStates = states ?? wf.states;
  const dirty = states !== null;

  const saveName = async () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== wf.displayName) {
      try {
        const result = await patch.mutateAsync({ name: trimmed });
        // The id derives from the name, so a rename changes the URL.
        navigate(`/workflows/${encodeURIComponent(result.workflow.workflowName)}/edit?section=${section}`, { replace: true });
        toast.success('Workflow renamed');
      } catch (err) { toast.error((err as Error).message); }
    }
    setEditingName(false);
  };

  const updateState = (idx: number, field: keyof WorkflowState, value: string) => {
    const next = [...currentStates];
    next[idx] = { ...next[idx]!, [field]: value };
    setStates(next);
  };
  const addState = () => setStates([...currentStates, { dir: '', name: '' }]);
  const removeState = (idx: number) => setStates(currentStates.filter((_, i) => i !== idx));
  const moveState = (from: number, to: number) => {
    if (from === to || to < 0 || to >= currentStates.length) return;
    const next = [...currentStates];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    setStates(next);
  };

  const saveStates = async () => {
    if (!states) return;
    try {
      await patch.mutateAsync({ states });
      setStates(null);
      toast.success('Workflow updated');
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleDelete = async () => {
    const alsoFiles = confirm(
      `Remove workflow "${wf.displayName}" from this workspace?\n\n`
      + 'OK also deletes its directory and every ticket in it.\n'
      + 'Cancel unregisters it and leaves the files on disk.',
    );
    try {
      await del.mutateAsync({ deleteFiles: alsoFiles });
      toast.success(alsoFiles ? 'Workflow deleted' : 'Workflow unregistered');
      navigate('/workflows');
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        {editingName ? (
          <input
            className="bg-slate-800 rounded px-2 py-1 text-lg font-semibold"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName();
              if (e.key === 'Escape') setEditingName(false);
            }}
            autoFocus
          />
        ) : (
          <h2
            className="text-lg font-semibold cursor-pointer hover:text-blue-400"
            onClick={() => { setNewName(wf.displayName); setEditingName(true); }}
          >{wf.displayName}</h2>
        )}
        <button className="px-3 py-1 rounded bg-red-700/50 hover:bg-red-700 text-sm" onClick={handleDelete}>
          Remove Workflow
        </button>
      </div>

      {!wf.available && (
        <p className="text-xs text-amber-400 mb-4">
          Registered in workspace.yaml but the directory is missing on disk.
        </p>
      )}

      {section === 'states' && (
        <section>
          <StatesEditor
            states={currentStates}
            ticketCounts={wf.ticketCounts}
            onUpdate={updateState}
            onAdd={addState}
            onRemove={removeState}
            onMove={moveState}
          />
          {dirty && (
            <div className="flex gap-2 mt-3">
              <button
                className="px-3 py-1 rounded bg-blue-600 text-sm"
                onClick={saveStates}
                disabled={patch.isPending}
              >Save</button>
              <button className="px-3 py-1 rounded bg-slate-700 text-sm" onClick={() => setStates(null)}>
                Discard
              </button>
            </div>
          )}
        </section>
      )}

      {section === 'process' && (
        <FocusGatedMarkdownEditor
          serverValue={wf.processDoc ?? ''}
          save={(content) => patch.mutateAsync({ processDoc: content })}
          externalLabel="PROCESS.md changed on disk while you were editing — your next save will overwrite it."
          savedToast="PROCESS.md saved"
          className="w-full bg-slate-800 rounded min-h-96"
          placeholder="Write process documentation…"
        />
      )}

      {section === 'runtime' && (
        <RuntimeSection
          runtime={wf.runtime}
          inherited={wf.runtimeInherited}
          onSave={(runtime) => patch.mutateAsync({ runtime })}
          pending={patch.isPending}
        />
      )}
    </div>
  );
}

const EMPTY_RUNTIME: RuntimeConfig = {
  harness: 'claude-code', provider: 'anthropic', model: '', args: [], env: {},
};

function RuntimeSection({
  runtime, inherited, onSave, pending,
}: {
  runtime: RuntimeConfig | null;
  inherited: boolean;
  onSave: (runtime: RuntimeConfig | null) => Promise<unknown>;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<RuntimeConfig | null>(null);
  const current = draft ?? runtime ?? EMPTY_RUNTIME;
  const set = (patch: Partial<RuntimeConfig>) => setDraft({ ...current, ...patch });

  return (
    <section>
      {/* An inherited block is otherwise indistinguishable from one this
          workflow declares, which matters: editing the fields below always
          writes to this workflow, never to the workspace default. */}
      <p className="text-xs mb-3">
        {runtime === null ? (
          <span className="text-slate-500">
            No runtime configured here or on the workspace. The agent launches with harness defaults.
          </span>
        ) : inherited ? (
          <span className="text-blue-300">
            Inherited from the workspace default. Saving here gives this workflow its own block.
          </span>
        ) : (
          <span className="text-slate-400">Defined by this workflow.</span>
        )}
      </p>

      <div className="grid gap-3">
        <Field label="Harness" value={current.harness} onChange={(v) => set({ harness: v })} />
        <Field label="Provider" value={current.provider} onChange={(v) => set({ provider: v })} />
        <Field label="Model" value={current.model} onChange={(v) => set({ model: v })}
          hint="Default model for tickets in this workflow. The per-run picker overrides it." />
        <Field
          label="Extra arguments"
          value={current.args.join(' ')}
          onChange={(v) => set({ args: v.split(/\s+/).filter(Boolean) })}
          hint="Space separated, appended to the harness command line."
        />
        <div>
          <label className="block text-xs text-slate-400 mb-1">Environment</label>
          <textarea
            className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-mono h-20"
            value={Object.entries(current.env).map(([k, v]) => `${k}=${v}`).join('\n')}
            placeholder="KEY=value, one per line"
            onChange={(e) => set({
              env: Object.fromEntries(
                e.target.value.split('\n')
                  .map(l => l.trim()).filter(Boolean)
                  .map(l => { const i = l.indexOf('='); return i === -1 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)]; }),
              ) as Record<string, string>,
            })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          className="px-3 py-1 rounded bg-blue-600 text-sm disabled:opacity-50"
          disabled={!draft || pending}
          onClick={async () => {
            try {
              await onSave(current);
              setDraft(null);
              toast.success('Runtime saved');
            } catch (err) { toast.error((err as Error).message); }
          }}
        >Save</button>
        {draft && (
          <button className="px-3 py-1 rounded bg-slate-700 text-sm" onClick={() => setDraft(null)}>
            Discard
          </button>
        )}
        {runtime !== null && !inherited && (
          <button
            className="ml-auto px-3 py-1 rounded bg-slate-700 text-sm"
            onClick={async () => {
              try {
                await onSave(null);
                setDraft(null);
                toast.success('Reverted to the workspace default');
              } catch (err) { toast.error((err as Error).message); }
            }}
          >Use workspace default</button>
        )}
      </div>
    </section>
  );
}

function Field({
  label, value, onChange, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}
