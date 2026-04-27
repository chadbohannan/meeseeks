import { Routes, Route } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { useRuntimeWs } from './hooks/use-runtime-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { PickerRoute } from './routes/PickerRoute.js';
import { BoardsRoute } from './routes/BoardsRoute.js';
import { BoardRoute } from './routes/BoardRoute.js';
import { TicketRoute } from './routes/TicketRoute.js';
import { Mdi } from './components/console/Mdi.js';
import { Dock } from './components/console/Dock.js';

export default function App() {
  useWsInvalidation();
  useRuntimeWs();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<PickerRoute />} />
          <Route path="/boards" element={<BoardsRoute />} />
          <Route path="/boards/:boardId" element={<BoardRoute />} />
          <Route path="/boards/:boardId/lanes/:laneName/tickets/:filename" element={<TicketRoute />} />
        </Route>
      </Routes>
      <Mdi />
      <Dock />
    </ErrorBoundary>
  );
}
