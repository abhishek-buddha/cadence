import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  FileText,
  Clock,
  PhoneCall,
  TrendingUp,
  DollarSign,
  ArrowDownToLine,
  Phone,
  PieChart,
  X,
} from 'lucide-react';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { useProviderFilter } from '../context/ProviderFilterContext';

const DATE_INPUT_CLASS =
  'bg-white border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:border-accent focus:ring-1 focus:ring-accent outline-none';

const OUTCOME_SEGMENTS = [
  { key: 'successful', label: 'Successful', color: 'bg-success' },
  { key: 'partial', label: 'Partial', color: 'bg-warn' },
  { key: 'failed', label: 'Failed', color: 'bg-danger' },
  { key: 'transferred', label: 'Transferred', color: 'bg-accent' },
];

const AGING_BUCKETS = [
  { key: '0-30', label: '0-30 days', color: 'bg-success' },
  { key: '31-60', label: '31-60 days', color: 'bg-accent' },
  { key: '61-90', label: '61-90 days', color: 'bg-warn' },
  { key: '91-120', label: '91-120 days', color: 'bg-orange-400' },
  { key: '120+', label: '120+ days', color: 'bg-danger' },
];

function formatCurrency(cents) {
  if (cents == null) return '$0.00';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ShimmerBlock({ className = '' }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <ShimmerBlock className="h-3 w-20" />
          <ShimmerBlock className="h-7 w-24" />
          <ShimmerBlock className="h-3 w-16" />
        </div>
        <ShimmerBlock className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { selectedProviderId } = useProviderFilter();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const statsArgs = {
    ...(selectedProviderId ? { providerId: selectedProviderId } : {}),
    ...(dateFrom ? { fromDate: dateFrom } : {}),
    ...(dateTo ? { toDate: dateTo } : {}),
  };
  const stats = useQuery(api.dashboard.getStats, statsArgs);
  const allRecentCalls = useQuery(api.calls.listRecent, { limit: 20 });
  const allClaims = useQuery(api.claims.list);

  const isLoading = stats === undefined;
  const hasDateFilter = Boolean(dateFrom || dateTo);

  function clearDateFilter() {
    setDateFrom('');
    setDateTo('');
  }

  // Filter recent calls by provider
  const providerClaimIds = selectedProviderId && allClaims
    ? new Set(allClaims.filter((c) => c.providerId === selectedProviderId).map((c) => c._id))
    : null;
  const recentCalls = (allRecentCalls ?? [])
    .filter((c) => !selectedProviderId || providerClaimIds?.has(c.claimId))
    .filter((c) => {
      if (!hasDateFilter) return true;
      const callDate = c.startedAt?.split('T')[0];
      if (!callDate) return false;
      if (dateFrom && callDate < dateFrom) return false;
      if (dateTo && callDate > dateTo) return false;
      return true;
    })
    .slice(0, 5);
  const callsLoading = allRecentCalls === undefined;

  // Calculate total claims in aging buckets for bar chart proportions
  const bucketTotal =
    stats?.byAgingBucket
      ? Object.values(stats.byAgingBucket).reduce((sum, v) => sum + v, 0)
      : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted mt-1">Real-time claims overview</p>
        </div>

        <div className="flex items-end gap-3 bg-white border border-border rounded-xl px-4 py-2.5 shadow-sm">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Date Range</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`${DATE_INPUT_CLASS} w-32`}
              />
              <span className="text-[11px] text-muted">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`${DATE_INPUT_CLASS} w-32`}
              />
            </div>
          </div>
          {hasDateFilter && (
            <button
              onClick={clearDateFilter}
              className="p-1.5 text-muted hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          <StatCard
            icon={FileText}
            label="Total Claims"
            value={stats?.totalClaims?.toLocaleString() ?? '0'}
            subValue={`${stats?.inProgressClaims ?? 0} in progress`}
          />
          <StatCard
            icon={Clock}
            label="Pending Follow-up"
            value={stats?.pendingClaims?.toLocaleString() ?? '0'}
            subValue="Requires attention"
            accent
          />
          <StatCard
            icon={PhoneCall}
            label="Calls Today"
            value={stats?.callsToday?.toLocaleString() ?? '0'}
            subValue={`${stats?.totalCalls ?? 0} total calls`}
          />
          <StatCard
            icon={TrendingUp}
            label="Success Rate"
            value={`${stats?.successRate ?? 0}%`}
            subValue={`${stats?.completedCalls ?? 0} completed`}
          />
          <StatCard
            icon={DollarSign}
            label="Total Billed"
            value={formatCurrency(stats?.totalBilled)}
            subValue="All claims"
          />
          <StatCard
            icon={ArrowDownToLine}
            label="Recovered"
            value={formatCurrency(stats?.recoveredAmount)}
            subValue={
              stats?.totalBilled
                ? `${Math.round(((stats.recoveredAmount ?? 0) / stats.totalBilled) * 100)}% recovery`
                : 'No claims billed'
            }
          />
        </div>
      )}

      {/* Outcome Distribution (this week) */}
      {(() => {
        const outcomeStats = stats?.outcomeStats;
        const outcomeTotal = outcomeStats
          ? OUTCOME_SEGMENTS.reduce((sum, s) => sum + (outcomeStats[s.key] ?? 0), 0)
          : 0;

        return (
          <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-semibold text-gray-900">
                Outcome Distribution
              </h2>
              <PieChart className="w-4 h-4 text-muted" />
            </div>
            <p className="text-xs text-muted mb-4">{stats?.outcomeWindowIsDateFilter ? 'Selected date range' : 'This week'}</p>

            {isLoading ? (
              <ShimmerBlock className="h-6 w-full" />
            ) : !outcomeStats || outcomeTotal === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-muted">
                  {!outcomeStats
                    ? 'Outcome data not available yet.'
                    : 'No outcomes recorded this week.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex h-3 w-full rounded-md overflow-hidden bg-surface">
                  {OUTCOME_SEGMENTS.map(({ key, color }) => {
                    const count = outcomeStats[key] ?? 0;
                    const pct = (count / outcomeTotal) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={key}
                        className={`${color} transition-all duration-700 ease-out`}
                        style={{ width: `${pct}%` }}
                        title={`${key}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  {OUTCOME_SEGMENTS.map(({ key, label, color }) => {
                    const count = outcomeStats[key] ?? 0;
                    const pct = outcomeTotal > 0 ? (count / outcomeTotal) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                        <span className="text-gray-600">{label}</span>
                        <span className="font-data text-muted">
                          {count}{' '}
                          <span className="text-muted/50">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Two-column layout for charts and recent calls */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Aging Bucket Distribution */}
        <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
          <h2 className="font-display font-semibold text-gray-900 mb-1">Aging Buckets</h2>
          <p className="text-xs text-muted mb-6">Claims distribution by age</p>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <ShimmerBlock className="h-3 w-20" />
                  <ShimmerBlock className="h-6 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {AGING_BUCKETS.map(({ key, label, color }) => {
                const count = stats?.byAgingBucket?.[key] ?? 0;
                const pct = bucketTotal > 0 ? (count / bucketTotal) * 100 : 0;

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className="text-sm font-data text-muted">
                        {count} <span className="text-muted/50">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-6 w-full bg-surface rounded-md overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-md transition-all duration-700 ease-out`}
                        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {bucketTotal === 0 && (
                <p className="text-sm text-muted text-center py-4">No claims data available</p>
              )}
            </div>
          )}
        </div>

        {/* Recent Calls */}
        <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-semibold text-gray-900">Recent Calls</h2>
            <Phone className="w-4 h-4 text-muted" />
          </div>
          <p className="text-xs text-muted mb-6">Last 5 call activities</p>

          {callsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-surface/50">
                  <ShimmerBlock className="h-4 w-24" />
                  <ShimmerBlock className="h-4 w-32 flex-1" />
                  <ShimmerBlock className="h-5 w-20" />
                  <ShimmerBlock className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : !recentCalls || recentCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PhoneCall className="w-8 h-8 text-muted/40 mb-3" />
              <p className="text-sm text-muted">No recent calls</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCalls.map((call) => (
                <div
                  key={call._id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-surface/50 border border-transparent hover:border-border-light transition-colors"
                >
                  <span className="font-data text-sm text-accent min-w-[90px]">
                    {call.claimNumber ?? '---'}
                  </span>
                  <span className="text-sm text-gray-600 truncate flex-1">
                    {call.insuranceCompany ?? 'Unknown'}
                  </span>
                  <StatusBadge status={call.status ?? 'unknown'} />
                  <span className="text-xs text-muted font-data whitespace-nowrap min-w-[60px] text-right">
                    {formatTime(call.startedAt ?? call._creationTime)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
