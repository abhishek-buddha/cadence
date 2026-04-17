import { useState } from 'react';

/**
 * Minimal inline-SVG pie/donut chart. No deps.
 * Props:
 *   data: [{ label: string, value: number, color?: string }, ...]
 *   size: number (default 200)
 *   donut: boolean (default true)
 *   showLegend: boolean (default true)
 *   formatValue: (n) => string
 */
const DEFAULT_PALETTE = [
  '#2563eb', '#0891b2', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0d9488', '#65a30d', '#ea580c', '#db2777',
];

export default function PieChart({
  data = [],
  size = 200,
  donut = true,
  showLegend = true,
  formatValue = (n) => n.toLocaleString(),
}) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted/60 italic"
        style={{ height: size }}
      >
        No data to display
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + (d.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const innerR = donut ? r * 0.55 : 0;

  let startAngle = -Math.PI / 2; // start at top

  const segments = data.map((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    let path;
    if (data.length === 1 || d.value === total) {
      // Full circle (or full donut)
      if (donut) {
        path = `M ${cx + r},${cy} A ${r},${r} 0 1 1 ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx + r},${cy} M ${cx + innerR},${cy} A ${innerR},${innerR} 0 1 0 ${cx - innerR},${cy} A ${innerR},${innerR} 0 1 0 ${cx + innerR},${cy} Z`;
      } else {
        path = `M ${cx + r},${cy} A ${r},${r} 0 1 1 ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx + r},${cy} Z`;
      }
    } else if (donut) {
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      path =
        `M ${x1},${y1} ` +
        `A ${r},${r} 0 ${largeArc} 1 ${x2},${y2} ` +
        `L ${ix2},${iy2} ` +
        `A ${innerR},${innerR} 0 ${largeArc} 0 ${ix1},${iy1} Z`;
    } else {
      path =
        `M ${cx},${cy} ` +
        `L ${x1},${y1} ` +
        `A ${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
    }

    const seg = {
      path,
      color: d.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
      label: d.label,
      value: d.value,
      pct: (d.value / total) * 100,
    };
    startAngle = endAngle;
    return seg;
  });

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-label="Pie chart"
        >
          {segments.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill={s.color}
              opacity={hoverIdx == null || hoverIdx === i ? 1 : 0.5}
              stroke="#fff"
              strokeWidth={1}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: 'pointer', transition: 'opacity 150ms' }}
            />
          ))}
          {donut && (
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              className="fill-gray-900 font-data"
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              {hoverIdx != null ? formatValue(segments[hoverIdx].value) : formatValue(total)}
            </text>
          )}
          {donut && (
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {hoverIdx != null
                ? `${segments[hoverIdx].pct.toFixed(0)}%`
                : 'Total'}
            </text>
          )}
        </svg>
      </div>

      {showLegend && (
        <div className="flex flex-col gap-2 min-w-0">
          {segments.map((s, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span
                className="w-3 h-3 rounded shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-sm text-gray-700 truncate">{s.label}</span>
              <span className="text-xs font-data text-muted ml-auto">
                {formatValue(s.value)} <span className="text-muted/60">({s.pct.toFixed(0)}%)</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
