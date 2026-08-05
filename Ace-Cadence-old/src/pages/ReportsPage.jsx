import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  BarChart3,
  TrendingUp,
  Target,
  Clock,
  AlertOctagon,
  Layers,
  Download,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import BarChart from '../components/BarChart';
import PieChart from '../components/PieChart';
import EmptyState from '../components/EmptyState';

const TABS = [
  { value: 'call_analytics', label: 'Call Analytics', icon: Sparkles },
  { value: 'success_rate', label: 'Success Rate', icon: TrendingUp },
  { value: 'data_accuracy', label: 'Data Accuracy', icon: Target },
  { value: 'turnaround_time', label: 'Turnaround Time', icon: Clock },
  { value: 'hold_metrics', label: 'Hold Metrics', icon: Clock },
  { value: 'operational_kpis', label: 'Operational KPIs', icon: BarChart3 },
  { value: 'exception_report', label: 'Exception Report', icon: AlertOctagon },
  { value: 'volume_by_tier', label: 'Volume by Tier', icon: Layers },
];

// Industry-typical manual hold+talk time for a claims follow-up call — an
// estimate, not a measured value. Used only to illustrate relative speed on
// the Call Analytics tab; every other number on that tab is real, queried data.
const MANUAL_BASELINE_SECONDS = 12 * 60;

// Values must match calls.useCase exactly ("medical_claim" | "dental_ev") —
// a prior "claim_followup" mismatch silently zeroed out every report whenever
// this filter was set to the medical option.
const USE_CASE_OPTIONS = [
  { value: '', label: 'All Case Types' },
  { value: 'medical_claim', label: 'Medical Claim' },
  { value: 'dental_ev', label: 'Dental EV' },
];

const INPUT_CLASS =
  'bg-white border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none w-full';
const SELECT_CLASS =
  'bg-white border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer';

function formatSecondsCompact(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return '0m';
  const mins = Math.floor(total / 60);
  const secs = Math.round(total % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function successPct(row) {
  return Number(row?.pct || row?.successRatePct || (row?.total ? (row.successful / row.total) * 100 : 0));
}

// null/undefined means no confidence sample in range — distinct from 0%.
function formatConfidence(value) {
  return value == null ? '--' : `${Math.round(value * 100)}%`;
}

function FilterSelect({ value, onChange, options, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${SELECT_CLASS} custom-select pr-8 w-full`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
    </div>
  );
}

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename, headers, rows) {
  const csvLines = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];
  const csvText = csvLines.join('\n');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function MetricCard({ label, value, caption, tone = 'default' }) {
  const toneClass = {
    default: 'text-gray-900',
    success: 'text-success',
    warn: 'text-warn',
    danger: 'text-danger',
    accent: 'text-accent',
  }[tone] || 'text-gray-900';
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">{label}</p>
      <p className={`text-2xl font-display font-bold font-data ${toneClass}`}>{value}</p>
      {caption && <p className="text-xs text-muted mt-1">{caption}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {subtitle && <p className="text-xs text-muted mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function DataTable({ headers, rows }) {
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-muted/60 italic text-center py-6">No data to display.</p>
    );
  }
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50/80 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-sm text-gray-700 font-data">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="space-y-3">
      <div className="shimmer rounded h-48 w-full" />
      <div className="shimmer rounded h-32 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Call Analytics — headline ROI summary, first tab.
// Every stat card is real queried data; the only assumption is the manual
// baseline used for the speed comparison, which is disclosed inline.
// ---------------------------------------------------------------------------
function CallAnalyticsTab({ filters }) {
  const successData = useQuery(api.reports?.successRate, filters);
  const kpis = useQuery(api.reports?.operationalKpis, filters);
  const accuracy = useQuery(api.reports?.dataAccuracy, filters);
  const turnaround = useQuery(api.reports?.turnaroundTime, filters);

  const isLoading =
    successData === undefined || kpis === undefined || accuracy === undefined || turnaround === undefined;

  const rows = turnaround ?? [];
  const totalCount = rows.reduce((s, r) => s + (r.count || 0), 0);
  const overallP50 = rows.length > 0 && totalCount > 0
    ? Math.round(rows.reduce((s, r) => s + (r.p50 || 0) * (r.count || 0), 0) / totalCount)
    : 0;

  if (isLoading) return <LoadingPlaceholder />;

  if (!successData || successData.total === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No calls in this range"
        description="Call analytics will appear here once calls have been made matching these filters."
      />
    );
  }

  const minutesSaved = kpis?.estimatedMinutesSaved || 0;
  const hoursSaved = Math.round((minutesSaved / 60) * 10) / 10;
  const daysSaved = Math.round((minutesSaved / 60 / 24) * 10) / 10;
  const costSavings = kpis?.estimatedCostSavings || 0;

  const capturePct = Math.round((accuracy?.overall?.captureRate || 0) * 100);
  const confidencePct = accuracy?.overall?.avgConfidence != null
    ? Math.round(accuracy.overall.avgConfidence * 100)
    : null;

  const speedMultiple = overallP50 > 0 ? Math.round((MANUAL_BASELINE_SECONDS / overallP50) * 10) / 10 : 0;
  const automationRate = kpis?.automationRate || 0;

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Time Saved"
          value={hoursSaved >= 24 ? `${daysSaved}d` : `${hoursSaved}h`}
          caption={`${minutesSaved.toLocaleString()} min of hold+talk time offloaded to AI`}
          tone="accent"
        />
        <MetricCard
          label="Est. Cost Savings"
          value={`$${costSavings.toLocaleString()}`}
          caption="At $28/hr fully-loaded agent cost"
          tone="success"
        />
        <MetricCard
          label="AI Data Accuracy"
          value={`${capturePct}%`}
          caption={confidencePct != null ? `${confidencePct}% avg extraction confidence` : 'Field capture rate'}
          tone="success"
        />
        <MetricCard
          label="Success Rate"
          value={`${(successData.successRatePct || 0).toFixed(1)}%`}
          caption={`${(successData.total || 0).toLocaleString()} calls`}
        />
      </div>

      {/* Processing speed comparison */}
      <ChartCard title="Processing Speed" subtitle="Median AI call time vs. a typical manual follow-up call">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          <MetricCard label="AI Median Call Time" value={formatSecondsCompact(overallP50)} tone="accent" />
          <MetricCard
            label="Typical Manual Call"
            value={formatSecondsCompact(MANUAL_BASELINE_SECONDS)}
            caption="Industry estimate — hold + talk time"
          />
          <MetricCard
            label="Speed Improvement"
            value={speedMultiple > 0 ? `${speedMultiple}x faster` : '--'}
            tone="success"
          />
        </div>
        <p className="text-xs text-muted italic">
          The manual baseline is an industry estimate for a typical insurance claims follow-up call (hold + talk
          time), not a measured value — it's shown only to illustrate relative speed. Every other figure on this
          tab comes directly from your call data.
        </p>
      </ChartCard>

      {/* Key insights */}
      <ChartCard title="Key Insights" subtitle="What the numbers mean for your team">
        <ul className="space-y-3">
          <li className="flex items-start gap-2.5 text-sm text-gray-700">
            <TrendingUp className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <span>
              AI calls resolve in a median of <strong className="font-data">{formatSecondsCompact(overallP50)}</strong>
              {speedMultiple > 0 && <> — roughly <strong>{speedMultiple}x faster</strong> than a typical manual follow-up call</>}.
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm text-gray-700">
            <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <span>
              Across <strong className="font-data">{(successData.total || 0).toLocaleString()}</strong> calls in this range,
              an estimated <strong className="font-data">{minutesSaved.toLocaleString()} minutes ({hoursSaved}h)</strong> of
              hold and talk time was handled by AI instead of a human agent.
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm text-gray-700">
            <Target className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <span>
              Field data-capture accuracy is <strong className="font-data">{capturePct}%</strong>
              {confidencePct != null && <> with <strong className="font-data">{confidencePct}%</strong> average extraction confidence</>},
              reducing manual re-entry and follow-up errors.
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm text-gray-700">
            <BarChart3 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <span>
              <strong className="font-data">{automationRate}%</strong> of completed calls resolved fully without a
              human handoff.
            </span>
          </li>
        </ul>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Success Rate
// ---------------------------------------------------------------------------
function SuccessRateTab({ filters }) {
  const overall = useQuery(api.reports?.successRate, filters);
  const byPayer = useQuery(api.reports?.successRateByPayer, filters);
  const byWeek = useQuery(api.reports?.successRateByWeek, filters);

  const isLoading = overall === undefined || byPayer === undefined || byWeek === undefined;

  const payerData = useMemo(
    () => (byPayer ?? []).map((row) => ({
      label: row.payerName || 'Unknown',
      value: Math.round(row.pct || 0),
    })),
    [byPayer]
  );

  const weekData = useMemo(
    () => (byWeek ?? []).map((row) => ({
      label: row.weekStart || row.label || '',
      value: Math.round(successPct(row)),
    })),
    [byWeek]
  );

  function exportData() {
    downloadCsv(
      `cadence-success-rate-by-payer-${new Date().toISOString().split('T')[0]}.csv`,
      ['Payer', 'Total Calls', 'Successful', 'Success Rate %'],
      (byPayer || []).map((row) => [
        row.payerName || 'Unknown',
        row.total ?? 0,
        row.successful ?? 0,
        Math.round(row.pct || 0),
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  if (!overall || overall.total === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No calls in this range"
        description="Success rate data will appear here once calls have been made matching these filters."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Overall Success Rate</p>
          <p className="text-3xl font-display font-bold text-gray-900">
            {(overall.successRatePct || 0).toFixed(1)}%
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Total Calls</p>
          <p className="text-3xl font-display font-bold text-gray-900 font-data">
            {(overall.total || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Successful Calls</p>
          <p className="text-3xl font-display font-bold text-success font-data">
            {(overall.successful || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <ChartCard
        title="Success Rate by Payer"
        subtitle="Percent of calls reaching a successful outcome"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <BarChart data={payerData} formatValue={(n) => `${n}%`} yAxisLabel="Success %" />
        <div className="mt-4">
          <DataTable
            headers={['Payer', 'Total Calls', 'Successful', 'Success Rate']}
            rows={(byPayer || []).map((row) => [
              row.payerName || 'Unknown',
              (row.total ?? 0).toLocaleString(),
              (row.successful ?? 0).toLocaleString(),
              `${Math.round(row.pct || 0)}%`,
            ])}
          />
        </div>
      </ChartCard>

      <ChartCard title="Success Rate by Week" subtitle="Trend over the past weeks">
        <BarChart data={weekData} formatValue={(n) => `${n}%`} yAxisLabel="Success %" />
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Data Accuracy
// ---------------------------------------------------------------------------
function DataAccuracyTab({ filters }) {
  const data = useQuery(api.reports?.dataAccuracy, filters);
  const isLoading = data === undefined;

  const fieldData = useMemo(
    () => (data?.byField ?? []).map((row) => ({
      label: row.field,
      value: Math.round((row.captureRate || 0) * 100),
    })),
    [data]
  );

  function exportData() {
    downloadCsv(
      `cadence-data-accuracy-${new Date().toISOString().split('T')[0]}.csv`,
      ['Field', 'Total', 'Captured', 'Capture Rate %', 'Avg Confidence %'],
      (data?.byField ?? []).map((row) => [
        row.field,
        row.totalCalls ?? 0,
        row.capturedCount ?? 0,
        Math.round((row.captureRate || 0) * 100),
        Math.round((row.avgConfidence || 0) * 100),
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  if (!data || data.byField.length === 0 || data.byField[0].totalCalls === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No extracted call results in this range"
        description="Field capture rates will appear here once calls have completed with AI-extracted data matching these filters."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Avg Field Capture Rate</p>
          <p className="text-3xl font-display font-bold text-gray-900">
            {Math.round((data.overall.captureRate || 0) * 100)}%
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Avg Confidence</p>
          <p className="text-3xl font-display font-bold text-gray-900">
            {formatConfidence(data.overall.avgConfidence)}
          </p>
        </div>
      </div>

      <ChartCard
        title="Field Capture Rate"
        subtitle="Percent of calls where each field was successfully extracted"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <BarChart data={fieldData} formatValue={(n) => `${n}%`} yAxisLabel="Capture %" />
        <div className="mt-4">
          <DataTable
            headers={['Field', 'Total Calls', 'Captured', 'Capture Rate', 'Avg Confidence']}
            rows={(data?.byField || []).map((row) => [
              row.field,
              (row.totalCalls ?? 0).toLocaleString(),
              (row.capturedCount ?? 0).toLocaleString(),
              `${Math.round((row.captureRate || 0) * 100)}%`,
              formatConfidence(row.avgConfidence),
            ])}
          />
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Turnaround Time
// ---------------------------------------------------------------------------
function TurnaroundTimeTab({ filters }) {
  const data = useQuery(api.reports?.turnaroundTime, filters);
  const isLoading = data === undefined;

  // Backend returns Array<{ useCase, count, p50, p95, p99 }>
  const rows = data ?? [];

  const chartData = useMemo(
    () => rows.map((row) => ({
      label: (row.useCase || 'unknown').replace(/_/g, ' '),
      value: row.p50 || 0,
    })),
    [rows]
  );

  // Aggregate p50/p95/p99 across all use cases (weighted by count)
  const totalCount = rows.reduce((s, r) => s + (r.count || 0), 0);
  const overallP50 = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (r.p50 || 0) * (r.count || 0), 0) / (totalCount || 1)) : 0;
  const overallP95 = rows.length > 0 ? Math.max(...rows.map((r) => r.p95 || 0)) : 0;
  const overallP99 = rows.length > 0 ? Math.max(...rows.map((r) => r.p99 || 0)) : 0;

  function exportData() {
    downloadCsv(
      `cadence-turnaround-time-${new Date().toISOString().split('T')[0]}.csv`,
      ['Use Case', 'Calls', 'P50 (s)', 'P95 (s)', 'P99 (s)'],
      rows.map((row) => [row.useCase || 'unknown', row.count ?? 0, row.p50 ?? 0, row.p95 ?? 0, row.p99 ?? 0])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No completed calls yet"
        description="Turnaround time will appear here once calls have completed."
      />
    );
  }

  return (
    <div className="space-y-6">
      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Median (P50)</p>
            <p className="text-2xl font-display font-bold text-gray-900 font-data">{overallP50}s</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">P95</p>
            <p className="text-2xl font-display font-bold text-warn font-data">{overallP95}s</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">P99</p>
            <p className="text-2xl font-display font-bold text-danger font-data">{overallP99}s</p>
          </div>
        </div>
      )}

      <ChartCard
        title="Call Duration by Use Case"
        subtitle="Median call duration (seconds) per use case"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <BarChart data={chartData} yAxisLabel="Seconds (P50)" />
        <div className="mt-4">
          <DataTable
            headers={['Use Case', 'Calls', 'P50 (s)', 'P95 (s)', 'P99 (s)']}
            rows={rows.map((row) => [
              (row.useCase || 'unknown').replace(/_/g, ' '),
              (row.count ?? 0).toLocaleString(),
              row.p50 ?? '--',
              row.p95 ?? '--',
              row.p99 ?? '--',
            ])}
          />
        </div>
      </ChartCard>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Tab content: Hold Metrics
// ---------------------------------------------------------------------------
function HoldMetricsTab({ filters }) {
  const data = useQuery(api.reports?.holdMetrics, filters);
  const isLoading = data === undefined;
  const metrics = data || {
    totalCalls: 0,
    callsWithHold: 0,
    avgHoldSeconds: 0,
    p95HoldSeconds: 0,
    maxHoldSeconds: 0,
    longHoldCount: 0,
    over30MinCount: 0,
    byPayer: [],
  };
  const payerRows = metrics.byPayer || [];

  const chartData = useMemo(
    () => payerRows.map((row) => ({
      label: row.payerName || 'Unknown',
      value: Math.round((row.avgHoldSeconds || 0) / 60),
    })),
    [payerRows]
  );

  function exportData() {
    downloadCsv(
      `cadence-hold-metrics-${new Date().toISOString().split('T')[0]}.csv`,
      ['Payer', 'Total Calls', 'Calls With Hold', 'Avg Hold', 'Longest Hold', 'Long Holds >= 10m'],
      payerRows.map((row) => [
        row.payerName || row.payer || '--',
        row.totalCalls ?? 0,
        row.callsWithHold ?? 0,
        formatSecondsCompact(row.avgHoldSeconds),
        formatSecondsCompact(row.maxHoldSeconds),
        row.longHoldCount ?? 0,
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Avg Hold Time</p>
          <p className="text-2xl font-display font-bold text-gray-900 font-data">
            {formatSecondsCompact(metrics.avgHoldSeconds)}
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Calls With Hold</p>
          <p className="text-2xl font-display font-bold text-gray-900 font-data">
            {(metrics.callsWithHold || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">P95 Hold</p>
          <p className="text-2xl font-display font-bold text-warn font-data">
            {formatSecondsCompact(metrics.p95HoldSeconds)}
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Long Holds</p>
          <p className="text-2xl font-display font-bold text-danger font-data">
            {(metrics.longHoldCount || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <ChartCard
        title="Average Hold Time by Payer"
        subtitle="Average time spent waiting on payer hold queues"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <BarChart data={chartData} formatValue={(n) => `${n}m`} yAxisLabel="Avg hold minutes" />
        <div className="mt-4">
          <DataTable
            headers={['Payer', 'Total Calls', 'Calls With Hold', 'Avg Hold', 'Longest Hold', 'Long Holds']}
            rows={payerRows.map((row) => [
              row.payerName || row.payer || '--',
              (row.totalCalls ?? 0).toLocaleString(),
              (row.callsWithHold ?? 0).toLocaleString(),
              formatSecondsCompact(row.avgHoldSeconds),
              formatSecondsCompact(row.maxHoldSeconds),
              (row.longHoldCount ?? 0).toLocaleString(),
            ])}
          />
        </div>
      </ChartCard>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Tab content: Operational KPIs
// ---------------------------------------------------------------------------
function OperationalKpisTab({ filters }) {
  const data = useQuery(api.reports?.operationalKpis, filters);
  const isLoading = data === undefined;
  const metrics = data || {};

  function exportData() {
    downloadCsv(
      `cadence-operational-kpis-${new Date().toISOString().split('T')[0]}.csv`,
      ['Metric', 'Value'],
      [
        ['Total Calls', metrics.totalCalls ?? 0],
        ['Completed Calls', metrics.completedCalls ?? 0],
        ['IVR Traversal Rate', `${metrics.ivrTraversalRate ?? 0}%`],
        ['Transfer Rate', `${metrics.transferRate ?? 0}%`],
        ['Automation Rate', `${metrics.automationRate ?? 0}%`],
        ['Calls Per Hour', metrics.callsPerHour ?? 0],
        ['Estimated Minutes Saved', metrics.estimatedMinutesSaved ?? 0],
        ['Estimated Cost Savings', `$${metrics.estimatedCostSavings ?? 0}`],
      ]
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="IVR Traversal" value={`${metrics.ivrTraversalRate || 0}%`} caption={`${metrics.ivrTraversed || 0}/${metrics.ivrAttempted || 0} calls`} tone="accent" />
        <MetricCard label="Transfer Rate" value={`${metrics.transferRate || 0}%`} caption={`${metrics.transferredCalls || 0} calls transferred`} tone="warn" />
        <MetricCard label="Automation Rate" value={`${metrics.automationRate || 0}%`} caption="Completed without handoff" tone="success" />
        <MetricCard label="Productivity" value={`${metrics.callsPerHour || 0}/hr`} caption="Completed call throughput" />
      </div>

      <ChartCard
        title="ROI and Efficiency"
        subtitle="Estimated from completed call duration and hold time"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard label="Total Calls" value={(metrics.totalCalls || 0).toLocaleString()} />
          <MetricCard label="Completed" value={(metrics.completedCalls || 0).toLocaleString()} tone="success" />
          <MetricCard label="Minutes Saved" value={(metrics.estimatedMinutesSaved || 0).toLocaleString()} tone="accent" />
          <MetricCard label="Cost Savings" value={`$${(metrics.estimatedCostSavings || 0).toLocaleString()}`} tone="success" />
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Exception Report
// ---------------------------------------------------------------------------
function ExceptionReportTab({ filters }) {
  // exceptionReport is a fixed "last 24h" alert view (not historical), so it
  // only accepts payerId — not the date-range/useCase filters the other tabs use.
  const data = useQuery(api.reports?.exceptionReport, { payerId: filters.payerId });
  const isLoading = data === undefined;

  // Backend returns Array<{ exception, payer, payerName, count, lastSeenAt }>
  const exceptions = data ?? [];

  const reasonData = useMemo(() => {
    const grouped = {};
    exceptions.forEach((row) => {
      const key = (row.exception || 'unknown').replace(/_/g, ' ');
      grouped[key] = (grouped[key] || 0) + (row.count || 1);
    });
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [exceptions]);

  function exportData() {
    downloadCsv(
      `cadence-exception-report-${new Date().toISOString().split('T')[0]}.csv`,
      ['Exception Type', 'Payer', 'Count', 'Last Seen'],
      exceptions.map((row) => [
        (row.exception || '').replace(/_/g, ' '),
        row.payerName || row.payer || '--',
        row.count ?? 1,
        row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '--',
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted -mt-2">
        Always shows the last 24 hours — only the Payer filter above applies here; Date Range and Case Type don't.
      </p>
      <ChartCard
        title="Exceptions by Type"
        subtitle="Calls that failed or required human escalation (last 24h)"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <PieChart data={reasonData} />
      </ChartCard>

      <ChartCard title="Exception Details" subtitle="Payers with exceptions in the last 24h">
        <DataTable
          headers={['Exception Type', 'Payer', 'Count', 'Last Seen']}
          rows={exceptions.map((row) => [
            (row.exception || '--').replace(/_/g, ' '),
            row.payerName || row.payer || '--',
            (row.count ?? 1).toLocaleString(),
            row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '--',
          ])}
        />
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Volume by Tier
// ---------------------------------------------------------------------------
function VolumeByTierTab({ filters }) {
  // volumeByTier takes no filter args
  const data = useQuery(api.reports?.volumeByTier, {});
  const isLoading = data === undefined;

  // Backend returns Array<{ payer, payerName, count, tier }>
  const rows = data ?? [];

  // Group by tier for the pie chart
  const tierData = useMemo(() => {
    const grouped = {};
    rows.forEach((row) => {
      const t = row.tier || 'low';
      grouped[t] = (grouped[t] || 0) + (row.count || 0);
    });
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [rows]);

  function exportData() {
    downloadCsv(
      `cadence-volume-by-tier-${new Date().toISOString().split('T')[0]}.csv`,
      ['Payer', 'Tier', 'Calls This Month'],
      rows.map((row) => [
        row.payerName || row.payer || '--',
        row.tier || 'low',
        row.count ?? 0,
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No calls this month"
        description="Call volume by payer tier will appear here once calls have been made this month."
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted -mt-2">
        Always shows the current calendar month across all payers — the filters above don't apply here.
      </p>
      <ChartCard
        title="Call Volume by Tier"
        subtitle="Distribution of calls this month by payer volume tier"
        action={
          <button
            onClick={exportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      >
        <PieChart data={tierData} />
        <div className="mt-4">
          <DataTable
            headers={['Payer', 'Tier', 'Calls This Month']}
            rows={rows.map((row) => [
              row.payerName || row.payer || '--',
              row.tier || 'low',
              (row.count ?? 0).toLocaleString(),
            ])}
          />
        </div>
      </ChartCard>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('call_analytics');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payerId, setPayerId] = useState('');
  const [useCase, setUseCase] = useState('');

  const insuranceContacts = useQuery(api.insuranceContacts.list);

  const filters = useMemo(() => {
    const args = {};
    if (dateFrom) args.fromDate = dateFrom;
    if (dateTo) args.toDate = dateTo;
    if (payerId) args.payerId = payerId;
    if (useCase) args.useCase = useCase;
    return args;
  }, [dateFrom, dateTo, payerId, useCase]);

  const payerOptions = [
    { value: '', label: 'All Payers' },
    ...(insuranceContacts ?? []).map((c) => ({ value: c._id, label: c.name })),
  ];

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in">
      {/* Tabs */}
      <div className="flex-1 min-h-0 flex flex-col bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="shrink-0 bg-white rounded-t-xl border-b border-border flex items-center gap-1 px-4 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-accent'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="shrink-0 flex flex-wrap items-end gap-5 px-4 py-3 border-b border-border bg-surface/40">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Date Range</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`${INPUT_CLASS} w-32`}
              />
              <span className="text-[11px] text-muted">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`${INPUT_CLASS} w-32`}
              />
            </div>
          </div>

          <div className="w-px h-8 bg-border" />

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Payer</label>
            <FilterSelect value={payerId} onChange={setPayerId} options={payerOptions} className="w-40" />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Case Type</label>
            <FilterSelect value={useCase} onChange={setUseCase} options={USE_CASE_OPTIONS} className="w-36" />
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-auto p-6">
          {activeTab === 'call_analytics' && <CallAnalyticsTab filters={filters} />}
          {activeTab === 'success_rate' && <SuccessRateTab filters={filters} />}
          {activeTab === 'data_accuracy' && <DataAccuracyTab filters={filters} />}
          {activeTab === 'turnaround_time' && <TurnaroundTimeTab filters={filters} />}
          {activeTab === 'hold_metrics' && <HoldMetricsTab filters={filters} />}
          {activeTab === 'operational_kpis' && <OperationalKpisTab filters={filters} />}
          {activeTab === 'exception_report' && <ExceptionReportTab filters={filters} />}
          {activeTab === 'volume_by_tier' && <VolumeByTierTab filters={filters} />}
        </div>
      </div>

      {/* Hidden hint badge to keep BarChart3 import used in default state */}
      <span className="sr-only"><BarChart3 className="w-3 h-3" /></span>
    </div>
  );
}
