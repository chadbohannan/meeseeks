export function Logo({ size = 24 }: { size?: number }) {
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size / 2 + r * 0.15;
  const sq = size * 0.22;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cy} r={r} fill="#3B82F6" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={r * 1.3}
        fontWeight="bold"
      >
        ∞
      </text>
      <rect
        x={cx - sq / 2}
        y={cy - r - sq / 2}
        width={sq}
        height={sq}
        fill="#F97316"
      />
    </svg>
  );
}
