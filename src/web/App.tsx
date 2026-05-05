import { Routes, Route, Navigate } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { useRuntimeWs } from './hooks/use-runtime-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { BoardEditorRoute } from './routes/BoardEditorRoute.js';
import { LaneRoute } from './routes/LaneRoute.js';
import { StateRoute } from './routes/StateRoute.js';
import { TicketRoute } from './routes/TicketRoute.js';
import { Mdi } from './components/console/Mdi.js';
import { PromptRunModals } from './components/console/PromptRunModal.js';

export default function App() {
  useWsInvalidation();
  useRuntimeWs();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/boards" replace />} />
          <Route path="/boards" element={<div className="p-8 text-slate-500">Select a board from the sidebar.</div>} />
          <Route path="/boards/:boardId" element={<BoardEditorRoute />} />
          <Route path="/boards/:boardId/lanes/:laneName" element={<LaneRoute />} />
          <Route path="/boards/:boardId/lanes/:laneName/state/:stateDir" element={<StateRoute />} />
          <Route path="/boards/:boardId/lanes/:laneName/tickets/:filename" element={<TicketRoute />} />
        </Route>
      </Routes>
      <Mdi />
      <PromptRunModals />
    </ErrorBoundary>
  );
}
