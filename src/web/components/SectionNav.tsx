export interface SectionItem<K extends string> {
  key: K;
  label: string;
}

/**
 * Left-hand section list shared by the workflow editor and workspace settings.
 * Each nav belongs to exactly one scope — the heading names it — so a section's
 * reach is readable from where it sits rather than from a warning on the panel.
 */
export function SectionNav<K extends string>({
  heading, items, active, onSelect,
}: {
  heading: string;
  items: ReadonlyArray<SectionItem<K>>;
  active: K;
  onSelect: (key: K) => void;
}) {
  return (
    <div className="border-b border-slate-800">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">
        {heading}
      </div>
      {items.map(item => (
        <div
          key={item.key}
          className={`px-4 py-2 cursor-pointer text-sm border-b border-slate-800/50 ${
            active === item.key ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/50'
          }`}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
