import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useProjects, useProject, usePatchProject, useDeleteProject,
} from '../hooks/queries.js';
import { NewProjectModal } from '../components/NewProjectModal.js';
import { DetectionChecklist, type AcceptedDetections } from '../components/DetectionChecklist.js';
import { mergeAllowedTools } from '../lib/detections.js';
import type { PermissionsConfig } from '@shared/types.js';

const FALLBACK_COLOR = '#64748b';

function linesToList(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

function listToLines(list: string[] | undefined): string {
  return (list ?? []).join('\n');
}

function PermissionsFields({
  value, onChange,
}: {
  value: PermissionsConfig;
  onChange: (next: PermissionsConfig) => void;
}) {
  const field = (
    label: string,
    key: keyof PermissionsConfig,
    hint: string,
  ) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <textarea
        className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-mono h-20"
        value={listToLines(value[key])}
        placeholder="one per line"
        onChange={(e) => onChange({ ...value, [key]: linesToList(e.target.value) })}
      />
      <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {field('Allowed directories', 'allowedPaths',
        'Extra --add-dir grants. Relative entries resolve against this project root. Cannot be revoked by a workflow.')}
      {field('Auto-approved tools', 'allowedTools',
        'Skips the approval prompt. Not a guardrail — absence means "ask", not "blocked".')}
      {field('Denied tools', 'deniedTools',
        'Hard block. Wins over any allow, from this project or any workflow.')}
    </div>
  );
}

function ProjectEditor({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProject(projectId);
  const patch = usePatchProject(projectId);
  const del = useDeleteProject();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<{
    name: string; root: string; color: string; context: string;
    contextFile: string | null; permissions: PermissionsConfig;
  } | null>(null);

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (!data) return <p className="text-red-400">Project not found.</p>;

  const p = data.project;
  const current = draft ?? {
    name: p.name,
    root: p.root,
    color: p.color ?? FALLBACK_COLOR,
    // When a context file is set, contextContent is that file's contents rather
    // than text the user typed here, so the textarea shows it read-only. Saving
    // it as inline context would replace a live reference with a stale copy.
    context: p.contextFile ? '' : (p.contextContent ?? ''),
    contextFile: p.contextFile,
    permissions: p.permissions ?? { allowedPaths: [], allowedTools: [], deniedTools: [] },
  };
  const set = (patchDraft: Partial<typeof current>) => setDraft({ ...current, ...patchDraft });

  return (
    <div className="max-w-3xl">
      {!p.available && (
        <p className="text-xs text-amber-400 mb-3">
          Root does not exist on disk. Agents started against this project will not find the codebase.
        </p>
      )}

      <div className="grid gap-3 mb-4">
        <div>
          {/* The selected project is already named by the highlighted chip above
              and by this field's value, so a heading would be a third copy. The
              id is shown here instead — it appears nowhere else, and this is
              where the rename caveat below is relevant. */}
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-xs text-slate-400">Name</label>
            <span className="text-[10px] text-slate-500 font-mono">id: {p.projectId}</span>
          </div>
          <input
            className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
            value={current.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <p className="text-[10px] text-slate-500 mt-0.5">
            Renaming does not change the id — tickets reference the id, so changing it would orphan them.
          </p>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Repository root</label>
          <input
            className="w-full bg-slate-800 rounded px-2 py-1 text-sm font-mono"
            value={current.root}
            onChange={(e) => set({ root: e.target.value })}
            placeholder="~/workspace/my-repo"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">
            Passed to the agent as --add-dir and named in its preamble. The agent&apos;s working
            directory stays on the board.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Badge color</label>
          <input
            type="color"
            value={current.color}
            onChange={(e) => set({ color: e.target.value })}
            className="w-8 h-6 bg-transparent"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Project context</label>
          {current.contextFile ? (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-slate-300 break-all">{current.contextFile}</span>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-slate-700 text-[10px] shrink-0"
                onClick={() => set({ contextFile: null })}
              >Use inline text instead</button>
            </div>
          ) : (
            <textarea
              className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-mono h-32"
              value={current.context}
              onChange={(e) => set({ context: e.target.value })}
              placeholder="What this codebase is, where its docs live…"
            />
          )}
          <p className="text-[10px] text-slate-500 mt-0.5">
            {current.contextFile
              ? 'Read from this file at spawn time, so edits in the repository take effect without touching the project config.'
              : 'Prepended to every agent preamble for this project, ahead of workflow context.'}
          </p>
        </div>
      </div>

      <h3 className="text-sm font-semibold mb-2">Permissions</h3>
      <p className="text-[11px] text-slate-500 mb-2">
        Unioned with the workflow&apos;s permissions at spawn time. Either side can deny; neither can
        undo the other&apos;s denial.
      </p>
      <PermissionsFields value={current.permissions} onChange={(next) => set({ permissions: next })} />

      <div className="mt-3">
        <DetectionChecklist
          root={current.root}
          onAccept={(accepted: AcceptedDetections) => set({
            permissions: {
              ...current.permissions,
              allowedTools: mergeAllowedTools(current.permissions.allowedTools, accepted.allowedTools),
            },
            ...(accepted.contextFile ? { contextFile: accepted.contextFile } : {}),
          })}
        />
      </div>

      <div className="flex items-center gap-2 mt-5">
        <button
          className="px-3 py-1 rounded bg-blue-600 text-sm disabled:opacity-50"
          disabled={!draft || patch.isPending}
          onClick={async () => {
            try {
              await patch.mutateAsync({
                name: current.name,
                root: current.root,
                color: current.color,
                // A context file wins over inline text when it is set, so the
                // two are never sent together: '' clears whichever is unused.
                context: current.contextFile ? '' : current.context,
                contextFile: current.contextFile ?? '',
                permissions: current.permissions,
              });
              setDraft(null);
              toast.success('Project saved');
            } catch (err) { toast.error((err as Error).message); }
          }}
        >Save</button>
        {draft && (
          <button className="px-3 py-1 rounded bg-slate-700 text-sm" onClick={() => setDraft(null)}>
            Discard
          </button>
        )}
        <button
          className="ml-auto px-3 py-1 rounded bg-red-700 text-sm"
          onClick={async () => {
            if (!confirm(`Delete project "${p.name}"? Tickets naming it keep the reference and will not be able to start agents until reassigned.`)) return;
            try {
              await del.mutateAsync(projectId);
              toast.success('Project deleted');
              navigate('/projects');
            } catch (err) { toast.error((err as Error).message); }
          }}
        >Delete</button>
      </div>
    </div>
  );
}

export function ProjectsRoute() {
  const { projectId } = useParams<{ projectId?: string }>();
  const { data, isLoading } = useProjects();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const projects = data?.projects ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl">Projects</h1>
        <button
          className="px-3 py-1 rounded bg-blue-600 text-sm"
          onClick={() => setShowNew(true)}
        >+ Project</button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        A project is a codebase configuration. Tickets on any board can be assigned to any project.
      </p>

      <NewProjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => navigate(`/projects/${encodeURIComponent(id)}`)}
      />

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {!isLoading && projects.length === 0 && (
        <p className="text-slate-500">No projects yet. Add one to start assigning tickets.</p>
      )}

      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {projects.map(p => (
            <Link
              key={p.projectId}
              to={`/projects/${encodeURIComponent(p.projectId)}`}
              className={`inline-flex items-center gap-2 rounded px-2 py-1 text-sm ${
                p.projectId === projectId ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              style={{ borderLeft: `3px solid ${p.color ?? FALLBACK_COLOR}` }}
            >
              {p.name}
              {!p.available && <span className="text-amber-400 text-xs" title="Root missing on disk">!</span>}
            </Link>
          ))}
        </div>
      )}

      {projectId && <ProjectEditor key={projectId} projectId={projectId} />}
    </div>
  );
}
