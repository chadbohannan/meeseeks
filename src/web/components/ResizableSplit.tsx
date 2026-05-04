import { useCallback, useRef, useState, type ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
  defaultSplit?: number;
  minLeft?: number;
  minRight?: number;
  storageKey?: string;
}

function readStored(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  const v = sessionStorage.getItem(key);
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function ResizableSplit({ left, right, defaultSplit = 0.5, minLeft = 200, minRight = 200, storageKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplitRaw] = useState(() => readStored(storageKey, defaultSplit));

  const setSplit = useCallback((v: number) => {
    setSplitRaw(v);
    if (storageKey) sessionStorage.setItem(storageKey, String(v));
  }, [storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const total = rect.width;
      const leftPx = Math.max(minLeft, Math.min(total - minRight, x));
      setSplit(leftPx / total);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [minLeft, minRight]);

  const leftPct = `${split * 100}%`;

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div className="overflow-auto shrink-0" style={{ width: leftPct, minWidth: minLeft }}>
        {left}
      </div>
      <div
        className="w-1 shrink-0 cursor-col-resize bg-slate-700 hover:bg-blue-500 transition-colors"
        onMouseDown={onMouseDown}
      />
      <div className="overflow-auto flex-1" style={{ minWidth: minRight }}>
        {right}
      </div>
    </div>
  );
}
