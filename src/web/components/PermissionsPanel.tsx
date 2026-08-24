import type { PermissionOrigin, ResolvedPermissionEntry, ResolvedPermissions } from '@shared/types.js';
import { useTicketPermissions } from '../hooks/queries.js';

const ORIGIN_STYLE: Record<PermissionOrigin, string> = {
  project: 'bg-sky-950 text-sky-300 border-sky-800',
  workflow: 'bg-violet-950 text-violet-300 border-violet-800',
};

function OriginTags({ origins }: { origins: PermissionOrigin[] }) {
  return (
    <span className="flex gap-1 shrink-0">
      {origins.map(o => (
        <span key={o} className={`rounded border px-1 text-[10px] leading-4 ${ORIGIN_STYLE[o]}`}>
          {o}
        </span>
      ))}
    </span>
  );
}

function Section({
  title, entries, emptyNote, tone = 'default',
}: {
  title: string;
  entries: ResolvedPermissionEntry[];
  emptyNote: string;
  tone?: 'default' | 'deny';
}) {
  return (
    <div className="mb-4">
      <h4 className={`text-xs font-semibold mb-1 ${tone === 'deny' ? 'text-red-400' : 'text-slate-300'}`}>
        {title} <span className="text-slate-500 font-normal">({entries.length})</span>
      </h4>
      {entries.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic">{emptyNote}</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map(e => (
            <li key={e.value} className="flex items-start gap-2 text-[11px] font-mono text-slate-300">
              <OriginTags origins={e.origins} />
              <span className="break-all">{e.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Body({ permissions }: { permissions: ResolvedPermissions | null }) {
  if (!permissions) {
    return (
      <p className="text-xs text-slate-500">
        No permission rules configured. The agent runs with Claude Code&apos;s defaults,
        prompting for anything that needs approval.
      </p>
    );
  }
  return (
    <>
      <Section
        title="Denied tools"
        entries={permissions.deniedTools}
        tone="deny"
        emptyNote="Nothing is hard-blocked."
      />
      <Section
        title="Auto-approved tools"
        entries={permissions.allowedTools}
        emptyNote="Nothing is pre-approved — every tool use prompts."
      />
      <Section
        title="Allowed directories"
        entries={permissions.allowedPaths}
        emptyNote="No extra directories granted."
      />
    </>
  );
}

interface Props {
  workflowName: string;
  filename: string;
  active: boolean;
}

/**
 * What a spawn *would* run with, resolved by the same code path the supervisor
 * uses. Shows provenance because project and workflow both contribute to one
 * effective policy, and "which file did this rule come from" is otherwise
 * guesswork.
 */
export function PermissionsPanel({ workflowName, filename, active }: Props) {
  const { data, isLoading, error } = useTicketPermissions(workflowName, filename, active);

  if (isLoading) return <p className="text-xs text-slate-500">Resolving…</p>;
  if (error) return <p className="text-xs text-red-400">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div>
      <div className="mb-3 text-[11px] text-slate-400">
        {data.projectId === null ? (
          <span className="text-amber-400">
            No project assigned — workflow rules only, and this ticket cannot start an agent.
          </span>
        ) : data.projectResolved ? (
          <>Effective rules for project <span className="text-slate-200">{data.projectId}</span> unioned with this workflow. Denials from either side always win for this ticket&apos;s agent; one-shot prompt runs bypass permissions.</>
        ) : (
          <span className="text-amber-400">
            Project &quot;{data.projectId}&quot; no longer exists — showing workflow rules only.
          </span>
        )}
      </div>
      <Body permissions={data.permissions} />
    </div>
  );
}
