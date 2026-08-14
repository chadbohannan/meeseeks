import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useBoard, useWorkflow } from '../hooks/queries.js';
import { useUi } from '../store/ui.js';
import { Kanban } from '../components/Kanban.js';
import { NewWorkflowModal } from '../components/NewWorkflowModal.js';

export function BoardRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  const board = useBoard(boardId);
  const { selectedWorkflow, setSelectedWorkflow } = useUi();
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);

  useEffect(() => {
    const workflows = board.data?.board.workflows;
    if (!workflows) return;
    if (!selectedWorkflow || !workflows.find((l) => l.workflowName === selectedWorkflow)) {
      setSelectedWorkflow(workflows[0]?.workflowName ?? null);
    }
  }, [board.data, selectedWorkflow, setSelectedWorkflow]);

  const workflow = useWorkflow(boardId, selectedWorkflow ?? undefined);

  if (!boardId) return <Navigate to="/boards" replace />;
  if (board.isLoading) return <div className="p-8 text-slate-500">Loading board…</div>;
  if (!board.data) return <div className="p-8 text-red-400">Board not found.</div>;

  const workflows = board.data.board.workflows;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <h1 className="text-lg font-semibold mr-4">{board.data.board.name}</h1>
        {workflows.length === 0 ? (
          <span className="text-slate-500 text-sm">No workflows yet.</span>
        ) : (
          <select
            className="bg-slate-800 rounded px-2 py-1 text-sm"
            value={selectedWorkflow ?? ''}
            onChange={(e) => setSelectedWorkflow(e.target.value)}
          >
            {workflows.map((l) => <option key={l.workflowName} value={l.workflowName}>{l.workflowName}</option>)}
          </select>
        )}
        <button className="px-2 py-1 rounded bg-slate-700 text-sm" onClick={() => setShowNewWorkflow(true)}>+ Workflow</button>
      </div>
      {selectedWorkflow && workflow.data && (
        <Kanban boardId={boardId} workflow={workflow.data.workflow} />
      )}
      <NewWorkflowModal boardId={boardId} open={showNewWorkflow} onClose={() => setShowNewWorkflow(false)} />
    </div>
  );
}
