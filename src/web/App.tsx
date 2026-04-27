import { Routes, Route } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

export default function App() {
  useWsInvalidation();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div className="p-8">Picker (next task)</div>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
