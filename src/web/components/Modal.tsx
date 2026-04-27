import type { ReactNode } from 'react';

interface Props {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
}

export function Modal({ title, open, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 rounded shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
