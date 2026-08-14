import { Routes, Route, Navigate } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { useRuntimeWs } from './hooks/use-runtime-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { WorkflowEditorRoute } from './routes/WorkflowEditorRoute.js';
import { WorkflowRoute } from './routes/WorkflowRoute.js';
import { StateRoute } from './routes/StateRoute.js';
import { TicketRoute } from './routes/TicketRoute.js';
import { ProjectsRoute } from './routes/ProjectsRoute.js';
import { SettingsRoute } from './routes/SettingsRoute.js';
import { Mdi } from './components/console/Mdi.js';
import { PromptRunModals } from './components/console/PromptRunModal.js';

export default function App() {
  useWsInvalidation();
  useRuntimeWs();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/workflows" replace />} />
          <Route path="/workflows" element={<div className="p-8 text-slate-500">Select a workflow from the sidebar.</div>} />
          <Route path="/projects" element={<ProjectsRoute />} />
          <Route path="/projects/:projectId" element={<ProjectsRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/workflows/:workflowName" element={<WorkflowRoute />} />
          <Route path="/workflows/:workflowName/edit" element={<WorkflowEditorRoute />} />
          <Route path="/workflows/:workflowName/state/:stateDir" element={<StateRoute />} />
          <Route path="/workflows/:workflowName/tickets/:filename" element={<TicketRoute />} />
        </Route>
      </Routes>
      <Mdi />
      <PromptRunModals />
    </ErrorBoundary>
  );
}
