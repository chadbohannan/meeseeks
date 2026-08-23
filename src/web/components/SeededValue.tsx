import type { Detection } from '@shared/types.js';

/**
 * One proposed value, shown with where it came from.
 *
 * This mirrors the treatment an inherited runtime block already gets on the
 * workflow editor: a value the user did not type is never presented as if they
 * had. The reason is on the row rather than only in a tooltip because a
 * checklist whose justifications are hidden behind hover is one people tick
 * through without reading, which is exactly the failure this review step exists
 * to prevent.
 */
export function SeededValue({
  detection, checked, onToggle,
}: {
  detection: Detection;
  checked: boolean;
  onToggle(next: boolean): void;
}) {
  const risky = /^(Write|Edit)\(/.test(detection.value);
  return (
    <li className="flex items-start gap-2 py-1">
      <input
        type="checkbox"
        className="mt-0.5 shrink-0"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={detection.value}
      />
      <div className="min-w-0">
        <div className={`text-[11px] font-mono break-all ${risky ? 'text-amber-300' : 'text-slate-200'}`}>
          {detection.value}
        </div>
        <div className="text-[10px] text-slate-500">
          {detection.reason} <span className="text-slate-600">· {detection.evidence}</span>
        </div>
      </div>
    </li>
  );
}
