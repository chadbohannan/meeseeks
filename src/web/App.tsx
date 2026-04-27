import { Routes, Route } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';

export default function App() {
  useWsInvalidation();
  return (
    <Routes>
      <Route path="/" element={<div className="p-8">Meeseeks — picker placeholder</div>} />
    </Routes>
  );
}
