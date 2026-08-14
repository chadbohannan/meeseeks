import type { ProjectSummary } from '@shared/types.js';
import { useProjects } from '../hooks/queries.js';
import { PROJECT_FILTER_ALL, PROJECT_FILTER_UNASSIGNED } from '../store/ui.js';

const FALLBACK_COLOR = '#64748b';

/**
 * Resolve a ticket's project slug against the workspace's project list. A slug
 * with no match is a dangling reference — the project was deleted while tickets
 * still named it — and is surfaced rather than hidden.
 */
export function findProject(
  projects: ProjectSummary[] | undefined,
  projectId: string | undefined,
): { project: ProjectSummary | null; unknown: boolean } {
  if (!projectId) return { project: null, unknown: false };
  const project = projects?.find(p => p.projectId === projectId) ?? null;
  return { project, unknown: project === null };
}

interface BadgeProps {
  projectId?: string;
  projects: ProjectSummary[] | undefined;
  className?: string;
}

/** Small project chip shown on ticket cards. Renders nothing when unassigned. */
export function ProjectBadge({ projectId, projects, className = '' }: BadgeProps) {
  if (!projectId) return null;
  const { project, unknown } = findProject(projects, projectId);

  if (unknown) {
    return (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-950 text-amber-300 border border-amber-700 ${className}`}
        title={`Project "${projectId}" no longer exists. Reassign this ticket to start an agent.`}
      >
        ? {projectId}
      </span>
    );
  }

  const color = project!.color ?? FALLBACK_COLOR;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-900/80 text-slate-300 ${className}`}
      style={{ border: `1px solid ${color}` }}
      title={project!.available ? project!.root : `${project!.root} (missing on disk)`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {project!.name}
      {!project!.available && <span className="text-amber-400" title="Root missing on disk">!</span>}
    </span>
  );
}

interface SelectProps {
  value: string | undefined;
  onChange: (projectId: string | undefined) => void;
  className?: string;
  /** Label used for the empty option. */
  unassignedLabel?: string;
  disabled?: boolean;
  /** Tooltip — worth setting whenever `disabled` is true, to say why. */
  title?: string;
}

/** Project picker. The empty option maps to undefined (unassigned). */
export function ProjectSelect({
  value, onChange, className = '', unassignedLabel = 'No project', disabled, title,
}: SelectProps) {
  const { data } = useProjects();
  const projects = data?.projects ?? [];
  // A dangling slug is kept as a selectable option so switching away from it is
  // possible without the select silently snapping to another value.
  const isUnknown = !!value && !projects.some(p => p.projectId === value);

  return (
    <select
      className={`bg-slate-800 rounded px-2 py-1 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      value={value ?? ''}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    >
      <option value="">{unassignedLabel}</option>
      {isUnknown && <option value={value}>{value} (missing)</option>}
      {projects.map(p => (
        <option key={p.projectId} value={p.projectId}>
          {p.name}{p.available ? '' : ' (root missing)'}
        </option>
      ))}
    </select>
  );
}

interface FilterProps {
  value: string;
  onChange: (value: string) => void;
}

/** Board-header filter. Filtering is client-side over already-loaded tickets. */
export function ProjectFilter({ value, onChange }: FilterProps) {
  const { data } = useProjects();
  const projects = data?.projects ?? [];
  const active = value !== PROJECT_FILTER_ALL;
  // A persisted filter naming a deleted project has no matching <option>, and a
  // select with an unmatched value renders its *first* option instead — so the
  // control would read "All" while still hiding everything. Keep the stale
  // value selectable so the display always matches the filter actually applied.
  const isStale = active
    && value !== PROJECT_FILTER_UNASSIGNED
    && !projects.some(p => p.projectId === value);

  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      Project
      <select
        className={`rounded px-2 py-1 text-xs ${
          active ? 'bg-blue-900 text-white ring-1 ring-blue-500' : 'bg-slate-800 text-slate-300'
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={PROJECT_FILTER_ALL}>All</option>
        <option value={PROJECT_FILTER_UNASSIGNED}>Unassigned</option>
        {isStale && <option value={value}>{value} (deleted)</option>}
        {projects.map(p => (
          <option key={p.projectId} value={p.projectId}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Shown when a filter is the reason a view looks empty. The sidebar's counts
 * come from the server and are never filtered, so without this the two
 * disagree with no visible explanation.
 */
export function FilteredEmptyNotice({
  hiddenCount, onClear,
}: {
  hiddenCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded border border-blue-800 bg-blue-950/40 px-3 py-2 text-sm">
      <span className="text-slate-300">
        {hiddenCount} {hiddenCount === 1 ? 'ticket is' : 'tickets are'} hidden by the project filter.
      </span>
      <button
        className="rounded bg-blue-700 px-2 py-0.5 text-xs hover:bg-blue-600"
        onClick={onClear}
      >Clear filter</button>
    </div>
  );
}

/** Shared predicate so the Kanban and state views filter identically. */
export function matchesProjectFilter(
  ticketProject: string | undefined,
  filter: string,
): boolean {
  if (filter === PROJECT_FILTER_ALL) return true;
  if (filter === PROJECT_FILTER_UNASSIGNED) return !ticketProject;
  return ticketProject === filter;
}
