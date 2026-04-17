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
} from 'lucide-react';
import BarChart from '../components/BarChart';
import PieChart from '../components/PieChart';
import EmptyState from '../components/EmptyState';

const TABS = [
  { value: 'success_rate', label: 'Success Rate', icon: TrendingUp },
  { value: 'data_accuracy', label: 'Data Accuracy', icon: Target },
  { value: 'turnaround_time', label: 'Turnaround Time', icon: Clock },
  { value: 'exception_report', label: 'Exception Report', icon: AlertOctagon },
  { value: 'volume_by_tier', label: 'Volume by Tier', icon: Layers },
];

const USE_CASE_OPTIONS = [
  { value: '', label: 'All Use Cases' },
  { value: 'claim_followup', label: 'Claim Follow-up' },
  { value: 'dental_ev', label: 'Dental EV' },
];

const INPUT_CLASS =
  'bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none w-full';
const SELECT_CLASS =
  'bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-700 focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer';

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
// Tab content: Success Rate
// ---------------------------------------------------------------------------
function SuccessRateTab({ filters }) {
  const overall = useQuery(api.reports?.successRate, filters);
  const byPayer = useQuery(api.reports?.successRateByPayer, filters);
  const byWeek = useQuery(api.reports?.successRateByWeek, filters);

  const isLoading = overall === undefined || byPayer === undefined || byWeek === undefined;

  const payerData = useMemo(
    () => (byPayer ?? []).map((row) => ({
      label: row.payerName || row.payerId || 'Unknown',
      value: Math.round((row.successRate || 0) * 100),
    })),
    [byPayer]
  );

  const weekData = useMemo(
    () => (byWeek ?? []).map((row) => ({
      label: row.weekStart || row.label || '',
      value: Math.round((row.successRate || 0) * 100),
    })),
    [byWeek]
  );

  function exportData() {
    if (!byPayer) return;
    downloadCsv(
      `cadence-success-rate-by-payer-${new Date().toISOString().split('T')[0]}.csv`,
      ['Payer', 'Total Calls', 'Successful', 'Success Rate %'],
      (byPayer || []).map((row) => [
        row.payerName || row.payerId || 'Unknown',
        row.totalCalls ?? 0,
        row.successfulCalls ?? 0,
        Math.round((row.successRate || 0) * 100),
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      {overall && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Overall Success Rate</p>
            <p className="text-3xl font-display font-bold text-gray-900">
              {Math.round((overall.successRate || 0) * 100)}%
            </p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Total Calls</p>
            <p className="text-3xl font-display font-bold text-gray-900 font-data">
              {(overall.totalCalls || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Successful Calls</p>
            <p className="text-3xl font-display font-bold text-success font-data">
              {(overall.successfulCalls || 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

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
              row.payerName || row.payerId || 'Unknown',
              (row.totalCalls ?? 0).toLocaleString(),
              (row.successfulCalls ?? 0).toLocaleString(),
              `${Math.round((row.successRate || 0) * 100)}%`,
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
    if (!data?.byField) return;
    downloadCsv(
      `cadence-data-accuracy-${new Date().toISOString().split('T')[0]}.csv`,
      ['Field', 'Total', 'Captured', 'Capture Rate %', 'Avg Confidence %'],
      data.byField.map((row) => [
        row.field,
        row.totalCalls ?? 0,
        row.capturedCount ?? 0,
        Math.round((row.captureRate || 0) * 100),
        Math.round((row.avgConfidence || 0) * 100),
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      {data?.overall && (
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
              {Math.round((data.overall.avgConfidence || 0) * 100)}%
            </p>
          </div>
        </div>
      )}

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
              `${Math.round((row.avgConfidence || 0) * 100)}%`,
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

  const distributionData = useMemo(
    () => (data?.distribution ?? []).map((row) => ({
      label: row.bucket,
      value: row.count,
    })),
    [data]
  );

  function exportData() {
    if (!data?.distribution) return;
    downloadCsv(
      `cadence-turnaround-time-${new Date().toISOString().split('T')[0]}.csv`,
      ['Bucket', 'Calls'],
      data.distribution.map((row) => [row.bucket, row.count ?? 0])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Avg Duration</p>
            <p className="text-2xl font-display font-bold text-gray-900 font-data">
              {Math.round(data.summary.avgSeconds || 0)}s
            </p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">Median</p>
            <p className="text-2xl font-display font-bold text-gray-900 font-data">
              {Math.round(data.summary.medianSeconds || 0)}s
            </p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">P90</p>
            <p className="text-2xl font-display font-bold text-warn font-data">
              {Math.round(data.summary.p90Seconds || 0)}s
            </p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">P99</p>
            <p className="text-2xl font-display font-bold text-danger font-data">
              {Math.round(data.summary.p99Seconds || 0)}s
            </p>
          </div>
        </div>
      )}

      <ChartCard
        title="Call Duration Distribution"
        subtitle="Number of calls by duration bucket"
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
        <BarChart data={distributionData} yAxisLabel="Calls" />
        <div className="mt-4">
          <DataTable
            headers={['Bucket', 'Calls']}
            rows={(data?.distribution || []).map((row) => [row.bucket, (row.count ?? 0).toLocaleString()])}
          />
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Exception Report
// ---------------------------------------------------------------------------
function ExceptionReportTab({ filters }) {
  const data = useQuery(api.reports?.exceptionReport, filters);
  const isLoading = data === undefined;

  const reasonData = useMemo(
    () => (data?.byReason ?? []).map((row) => ({
      label: row.reason,
      value: row.count,
    })),
    [data]
  );

  function exportData() {
    if (!data?.exceptions) return;
    downloadCsv(
      `cadence-exception-report-${new Date().toISOString().split('T')[0]}.csv`,
      ['Date', 'Payer', 'Reason', 'Severity', 'Reference'],
      data.exceptions.map((row) => [
        row.timestamp ? new Date(row.timestamp).toISOString() : '',
        row.payer || '',
        row.reason || '',
        row.severity || '',
        row.reference || '',
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  const exceptions = data?.exceptions || [];

  return (
    <div className="space-y-6">
      <ChartCard
        title="Exceptions by Reason"
        subtitle="Calls that failed or required human escalation"
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

      <ChartCard title="Recent Exceptions" subtitle="Most recent failed or escalated calls">
        {exceptions.length === 0 ? (
          <EmptyState
            icon={AlertOctagon}
            title="No exceptions"
            description="All calls completed successfully in this date range."
          />
        ) : (
          <DataTable
            headers={['Date', 'Payer', 'Reason', 'Severity', 'Reference']}
            rows={exceptions.map((row) => [
              row.timestamp ? new Date(row.timestamp).toLocaleString() : '--',
              row.payer || '--',
              row.reason || '--',
              row.severity || '--',
              row.reference || '--',
            ])}
          />
        )}
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content: Volume by Tier
// ---------------------------------------------------------------------------
function VolumeByTierTab({ filters }) {
  const data = useQuery(api.reports?.volumeByTier, filters);
  const isLoading = data === undefined;

  const tierData = useMemo(
    () => (data?.tiers ?? []).map((row) => ({
      label: row.tier,
      value: row.count,
    })),
    [data]
  );

  function exportData() {
    if (!data?.tiers) return;
    downloadCsv(
      `cadence-volume-by-tier-${new Date().toISOString().split('T')[0]}.csv`,
      ['Tier', 'Calls', 'Avg Cost ($)', 'Total Cost ($)'],
      data.tiers.map((row) => [
        row.tier,
        row.count ?? 0,
        ((row.avgCostCents || 0) / 100).toFixed(2),
        ((row.totalCostCents || 0) / 100).toFixed(2),
      ])
    );
  }

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      <ChartCard
        title="Call Volume by Tier"
        subtitle="Distribution of calls across complexity / cost tiers"
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
            headers={['Tier', 'Calls', 'Avg Cost', 'Total Cost']}
            rows={(data?.tiers || []).map((row) => [
              row.tier,
              (row.count ?? 0).toLocaleString(),
              `$${((row.avgCostCents || 0) / 100).toFixed(2)}`,
              `$${((row.totalCostCents || 0) / 100).toFixed(2)}`,
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
  const [activeTab, setActiveTab] = useState('success_rate');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payerId, setPayerId] = useState('');
  const [useCase, setUseCase] = useState('');

  const insuranceContacts = useQuery(api.insuranceContacts.list);

  const filters = useMemo(() => {
    const args = {};
    if (dateFrom) args.from = dateFrom;
    if (dateTo) args.to = dateTo;
    if (payerId) args.insuranceContactId = payerId;
    if (useCase) args.useCase = useCase;
    return args;
  }, [dateFrom, dateTo, payerId, useCase]);

  const payerOptions = [
    { value: '', label: 'All Payers' },
    ...(insuranceContacts ?? []).map((c) => ({ value: c._id, label: c.name })),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Reports</h1>
        <p className="text-sm text-muted mt-1">Operational metrics and analytics</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="border-b border-border flex items-center gap-1 px-4 overflow-x-auto">
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
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`${INPUT_CLASS} w-40`}
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`${INPUT_CLASS} w-40`}
          />
          <FilterSelect value={payerId} onChange={setPayerId} options={payerOptions} className="w-52" />
          <FilterSelect value={useCase} onChange={setUseCase} options={USE_CASE_OPTIONS} className="w-44" />
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'success_rate' && <SuccessRateTab filters={filters} />}
          {activeTab === 'data_accuracy' && <DataAccuracyTab filters={filters} />}
          {activeTab === 'turnaround_time' && <TurnaroundTimeTab filters={filters} />}
          {activeTab === 'exception_report' && <ExceptionReportTab filters={filters} />}
          {activeTab === 'volume_by_tier' && <VolumeByTierTab filters={filters} />}
        </div>
      </div>

      {/* Hidden hint badge to keep BarChart3 import used in default state */}
      <span className="sr-only"><BarChart3 className="w-3 h-3" /></span>
    </div>
  );
}
