import { useState } from 'react';
import { toast } from 'sonner';
import { useDetectProject } from '../hooks/queries.js';
import { SeededValue } from './SeededValue.js';
import {
  partitionAccepted, detectionKey, type AcceptedDetections,
} from '../lib/detections.js';
import type { Detection } from '@shared/types.js';

export type { AcceptedDetections };

/**
 * Inspect a repository root and let the user accept what it proposes.
 *
 * Nothing here writes: `onAccept` hands the accepted values back to the form,
 * which folds them into its draft, and the user still has to save. That gap is
 * the point — an unreviewed permission grant is a security-relevant default,
 * and "Meeseeks noticed your repo declares a test script and suggests allowing
 * it" is a different product from "Meeseeks granted it".
 */
export function DetectionChecklist({
  root, onAccept,
}: {
  root: string;
  onAccept(accepted: AcceptedDetections): void;
}) {
  const detect = useDetectProject();
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const key = detectionKey;

  const run = async () => {
    if (!root.trim()) { toast.error('Enter a repository root first'); return; }
    try {
      const res = await detect.mutateAsync(root.trim());
      setDetections(res.detections);
      setChecked(new Set(res.detections.filter(d => d.preselected).map(key)));
      if (res.detections.length === 0) toast.message('Nothing detected at that path');
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="rounded border border-slate-700 p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-2 py-1 rounded bg-slate-700 text-xs disabled:opacity-50"
          onClick={run}
          disabled={detect.isPending}
        >
          {detect.isPending ? 'Inspecting…' : 'Detect from repository'}
        </button>
        <span className="text-[10px] text-slate-500">
          Reads the repository and proposes grants. Nothing is written until you accept and save.
        </span>
      </div>

      {detections && detections.length > 0 && (
        <>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {detections.map(d => (
              <SeededValue
                key={key(d)}
                detection={d}
                checked={checked.has(key(d))}
                onToggle={(next) => {
                  const copy = new Set(checked);
                  if (next) copy.add(key(d)); else copy.delete(key(d));
                  setChecked(copy);
                }}
              />
            ))}
          </ul>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              className="px-2 py-1 rounded bg-blue-600 text-xs disabled:opacity-50"
              disabled={checked.size === 0}
              onClick={() => {
                onAccept(partitionAccepted(detections.filter(d => checked.has(key(d)))));
                setDetections(null);
                setChecked(new Set());
              }}
            >Accept {checked.size} of {detections.length}</button>
            <button
              type="button"
              className="px-2 py-1 rounded bg-slate-700 text-xs"
              onClick={() => { setDetections(null); setChecked(new Set()); }}
            >Dismiss</button>
            {/* Write and Edit arrive unchecked; saying so keeps a user from
                reading the unticked rows as a detection failure. */}
            <span className="text-[10px] text-slate-500 ml-auto">
              Write and Edit grants start unchecked.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
