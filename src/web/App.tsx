import { Routes, Route } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { PickerRoute } from './routes/PickerRoute.js';
import { BoardsRoute } from './routes/BoardsRoute.js';
import { BoardRoute } from './routes/BoardRoute.js';

export default function App() {
  useWsInvalidation();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<PickerRoute />} />
          <Route path="/boards" element={<BoardsRoute />} />
          <Route path="/boards/:boardId" element={<BoardRoute />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
