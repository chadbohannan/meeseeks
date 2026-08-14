import { useParams, Navigate } from 'react-router-dom';
import { useWorkflow } from '../hooks/queries.js';
import { Kanban } from '../components/Kanban.js';

export function WorkflowRoute() {
  const { workflowName } = useParams<{ workflowName: string }>();
  const workflow = useWorkflow(workflowName);

  if (!workflowName) return <Navigate to="/workflows" replace />;
  if (workflow.isLoading) return <div className="p-8 text-slate-500">Loading workflow…</div>;
  if (!workflow.data) return <div className="p-8 text-red-400">Workflow not found.</div>;

  return <Kanban workflow={workflow.data.workflow} />;
}
