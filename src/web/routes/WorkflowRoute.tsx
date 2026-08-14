import { useParams, Navigate } from 'react-router-dom';
import { useWorkflow } from '../hooks/queries.js';
import { Kanban } from '../components/Kanban.js';

export function WorkflowRoute() {
  const { boardId, workflowName } = useParams<{ boardId: string; workflowName: string }>();
  const workflow = useWorkflow(boardId, workflowName);

  if (!boardId || !workflowName) return <Navigate to="/boards" replace />;
  if (workflow.isLoading) return <div className="p-8 text-slate-500">Loading workflow…</div>;
  if (!workflow.data) return <div className="p-8 text-red-400">Workflow not found.</div>;

  return <Kanban boardId={boardId} workflow={workflow.data.workflow} />;
}
