import { useState } from 'react';

/**
 * Minimal inline-SVG bar chart. No deps.
 * Props:
 *   data: [{ label: string, value: number, color?: string }, ...]
 *   width: number (default 600)
 *   height: number (default 240)
 *   formatValue: optional (n) => string
 *   yAxisLabel: optional string
 */
export default function BarChart({
  data = [],
  width = 600,
  height = 240,
  formatValue = (n) => n.toLocaleString(),
  yAxisLabel,
}) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted/60 italic"
        style={{ height }}
      >
        No data to display
      </div>
    );
  }

  const padding = { top: 16, right: 16, bottom: 48, left: yAxisLabel ? 56 : 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const niceMax = niceCeil(maxValue);

  const barGap = 8;
  const barWidth = Math.max(4, (chartWidth - barGap * (data.length - 1)) / data.length);

  // Y-axis tick lines (5 ticks)
  const yTicks = 5;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => (niceMax / yTicks) * i);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Bar chart"
      >
        {/* Y-axis label */}
        {yAxisLabel && (
          <text
            x={14}
            y={height / 2}
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle"
            className="fill-muted text-[10px] uppercase tracking-wider font-medium"
          >
            {yAxisLabel}
          </text>
        )}

        {/* Y-axis grid lines + ticks */}
        {tickValues.map((v, i) => {
          const y = padding.top + chartHeight - (v / niceMax) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                x2={padding.left + chartWidth}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={i === 0 ? '0' : '2 2'}
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted text-[10px] font-data"
              >
                {formatValue(Math.round(v))}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barHeight = (d.value / niceMax) * chartHeight;
          const x = padding.left + i * (barWidth + barGap);
          const y = padding.top + chartHeight - barHeight;
          const fill = d.color || '#2563eb';
          const isHover = hoverIdx === i;
          return (
            <g
              key={i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={fill}
                opacity={isHover ? 1 : 0.85}
                rx={2}
              />
              {/* X-axis label */}
              <text
                x={x + barWidth / 2}
                y={padding.top + chartHeight + 14}
                textAnchor="middle"
                className="fill-muted text-[10px]"
              >
                {truncateLabel(d.label, barWidth)}
              </text>
              {/* Value label */}
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-gray-700 text-[10px] font-data"
                opacity={isHover || data.length <= 12 ? 1 : 0}
              >
                {formatValue(d.value)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoverIdx != null && (
        <div className="absolute top-2 right-2 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none">
          <p className="font-medium">{data[hoverIdx].label}</p>
          <p className="font-data text-white/80">{formatValue(data[hoverIdx].value)}</p>
        </div>
      )}
    </div>
  );
}

function niceCeil(n) {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const norm = n / base;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function truncateLabel(label, barWidth) {
  if (!label) return '';
  // ~6px per char on average; leave some room
  const maxChars = Math.max(3, Math.floor(barWidth / 6));
  return label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
}
