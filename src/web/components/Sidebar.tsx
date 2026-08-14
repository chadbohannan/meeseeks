import { useState } from 'react';
import { useNavigate, useParams, useLocation, NavLink } from 'react-router-dom';
import { useWorkflows, useTickets, useProjects } from '../hooks/queries.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { useUi, workflowCollapseKey } from '../store/ui.js';
import { RuntimeStatusDot } from './RuntimeStatusDot.js';
import { NewWorkflowModal } from './NewWorkflowModal.js';
import type { WorkflowSummary } from '@shared/types.js';
import type { RuntimeSummary } from '@shared/runtime.js';

export function Sidebar() {
  const workflows = useWorkflows();
  const projects = useProjects();
  const [showNew, setShowNew] = useState(false);
  const unavailable = (projects.data?.projects ?? []).filter(p => !p.available).length;

  return (
    <nav className="flex flex-col h-full w-full bg-slate-950 border-r border-slate-800 overflow-y-auto text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Workflows</span>
        <button
          className="text-xs px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          onClick={() => setShowNew(true)}
        >+ Workflow</button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {workflows.isLoading && <p className="px-3 py-2 text-slate-500">Loading…</p>}
        {workflows.data?.workflows.map((w) => (
          <WorkflowNode key={w.workflowName} workflow={w} />
        ))}
        {workflows.data && workflows.data.workflows.length === 0 && (
          <p className="px-3 py-4 text-slate-500 text-center">No workflows yet</p>
        )}
      </div>
      <NavLink
        to="/projects"
        className={({ isActive }) =>
          `flex items-center gap-2 px-3 py-2 border-t border-slate-800 text-xs uppercase tracking-wide ${
            isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
          }`}
      >
        <span className="font-semibold">Projects</span>
        <span className="text-slate-500 normal-case">({projects.data?.projects.length ?? 0})</span>
        {unavailable > 0 && (
          <span className="ml-auto text-amber-400 normal-case" title={`${unavailable} project root(s) missing on disk`}>
            {unavailable} !
          </span>
        )}
      </NavLink>
      {/* Top-level rather than inside a workflow editor: these files are
          workspace-scoped, and a workspace with no workflows yet still needs
          somewhere to write a prompt or a skill. */}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `flex items-center gap-2 px-3 py-2 border-t border-slate-800 text-xs uppercase tracking-wide ${
            isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
          }`}
      >
        <span className="font-semibold">Workspace</span>
      </NavLink>
      <NewWorkflowModal open={showNew} onClose={() => setShowNew(false)} />
    </nav>
  );
}

function CollapseToggle({
  collapsed,
  visible,
  onToggle,
}: {
  collapsed: boolean;
  visible: boolean;
  onToggle: () => void;
}) {
  if (!visible) {
    return <span className="inline-block w-5 shrink-0" aria-hidden />;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-100"
      aria-label={collapsed ? 'Expand' : 'Collapse'}
    >
      <span className="text-base leading-none">{collapsed ? '▸' : '▾'}</span>
    </button>
  );
}

function useActiveState() {
  const { workflowName } = useParams<{ workflowName?: string }>();
  const location = useLocation();
  const stateMatch = location.pathname.match(/\/state\/([^/]+)/);
  const ticketMatch = location.pathname.match(/\/tickets\/([^/]+)/);
  return {
    workflowName,
    stateDir: stateMatch?.[1] ? decodeURIComponent(stateMatch[1]) : undefined,
    filename: ticketMatch?.[1] ? decodeURIComponent(ticketMatch[1]) : undefined,
  };
}

function isRuntimeActive(r: RuntimeSummary) {
  return r.status === 'running' || r.status === 'starting' || r.status === 'idle' || r.status === 'awaiting-user';
}

function WorkflowNode({ workflow }: { workflow: WorkflowSummary }) {
  const active = useActiveState();
  const navigate = useNavigate();
  const isActive = active.workflowName === workflow.workflowName;

  const runtimes = useRuntimesStore((s) => s.byId);
  const workflowRuntimes = Object.values(runtimes).filter(
    (r) => r.kind === 'ticket' && r.ticketRef?.workflowName === workflow.workflowName && isRuntimeActive(r),
  );
  const hasActiveRuntime = workflowRuntimes.length > 0;

  const tickets = useTickets(hasActiveRuntime ? workflow.workflowName : undefined);
  const ticketsByFilename = new Map(
    (tickets.data?.tickets ?? []).map((t) => [t.filename, t]),
  );

  const userCollapsed = useUi((s) => !!s.collapsed[workflowCollapseKey(workflow.workflowName)]);
  const toggleCollapsed = useUi((s) => s.toggleCollapsed);
  const effectiveCollapsed = userCollapsed && !hasActiveRuntime;

  const base = `/workflows/${encodeURIComponent(workflow.workflowName)}`;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-slate-800 ${
          isActive && !active.stateDir && !active.filename ? 'bg-slate-800 text-white' : 'text-slate-300'
        }`}
        onClick={() => navigate(base)}
      >
        <CollapseToggle
          collapsed={effectiveCollapsed}
          visible={workflow.states.length > 0}
          onToggle={() => toggleCollapsed(workflowCollapseKey(workflow.workflowName))}
        />
        <span className={`truncate flex-1 ${!workflow.available ? 'opacity-50' : ''}`}>
          {workflow.displayName}
        </span>
        {/* Registered in workspace.yaml but missing on disk. Shown rather than
            hidden so a mistyped or half-deleted entry is visible. */}
        {!workflow.available && (
          <span className="text-amber-400 text-xs shrink-0" title="Directory missing on disk">!</span>
        )}
      </div>
      {!effectiveCollapsed && (
      <div className="ml-5">
        {workflow.states.map((st) => {
          const count = workflow.ticketCounts[st.dir] ?? 0;
          const isStateActive = active.stateDir === st.dir && active.workflowName === workflow.workflowName;
          const stateRuntimes = workflowRuntimes.filter((r) => {
            if (!r.ticketRef) return false;
            const ticket = ticketsByFilename.get(r.ticketRef.filename);
            return ticket?.state === st.dir;
          });
          return (
            <div key={st.dir}>
              <div
                className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-slate-800 text-xs ${
                  isStateActive ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
                onClick={() => navigate(`${base}/state/${encodeURIComponent(st.dir)}`)}
              >
                <span className="truncate flex-1">{st.name}</span>
                <span className="text-slate-500 tabular-nums">{count}</span>
              </div>
              {stateRuntimes.map((r) => {
                const ticket = ticketsByFilename.get(r.ticketRef!.filename);
                const isTicketActive = active.filename === r.ticketRef!.filename && active.workflowName === workflow.workflowName;
                return (
                  <div
                    key={r.runtimeId}
                    className={`flex items-center gap-1.5 pl-4 pr-2 py-[7px] my-[5px] rounded-md cursor-pointer hover:bg-slate-800 text-sm ${
                      isTicketActive ? 'bg-slate-800 text-white' : 'text-slate-400'
                    }`}
                    style={{ border: `2px solid ${ticket?.color || "#6b7280"}` }}
                    onClick={() => navigate(`${base}/tickets/${encodeURIComponent(r.ticketRef!.filename)}`)}
                  >
                    <span className="truncate whitespace-nowrap">{ticket?.title ?? r.ticketRef!.filename}</span>
                    <RuntimeStatusDot status={r.status} className="shrink-0 ml-auto h-3 w-3" />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
