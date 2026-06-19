/**
 * Minimal monochrome bar chart (pure SVG, no dependencies). Shows daily
 * received volume. Bars in black, baseline in ink.
 */
export function VolumeBars({
  data,
  height = 120,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = 100 / data.length;

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label="Daily received volume"
      >
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 8);
          const x = i * barW;
          return (
            <rect
              key={i}
              x={x + barW * 0.18}
              y={height - h}
              width={barW * 0.64}
              height={Math.max(h, d.value > 0 ? 1.5 : 0)}
              rx={0.6}
              className="fill-ink-900"
            />
          );
        })}
        <line
          x1="0"
          y1={height}
          x2="100"
          y2={height}
          className="stroke-ink-200"
          strokeWidth="0.5"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
