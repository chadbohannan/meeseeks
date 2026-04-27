import { Routes, Route } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { PickerRoute } from './routes/PickerRoute.js';

export default function App() {
  useWsInvalidation();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<PickerRoute />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
