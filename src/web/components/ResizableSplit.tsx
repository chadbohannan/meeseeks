import { useCallback, useRef, useState, type ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
  defaultSplit?: number;
  minLeft?: number;
  minRight?: number;
}

export function ResizableSplit({ left, right, defaultSplit = 0.5, minLeft = 200, minRight = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(defaultSplit);

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
  const rightPct = `${(1 - split) * 100}%`;

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div className="overflow-auto" style={{ width: leftPct, minWidth: minLeft }}>
        {left}
      </div>
      <div
        className="w-1 shrink-0 cursor-col-resize bg-slate-700 hover:bg-blue-500 transition-colors"
        onMouseDown={onMouseDown}
      />
      <div className="overflow-auto" style={{ width: rightPct, minWidth: minRight }}>
        {right}
      </div>
    </div>
  );
}
