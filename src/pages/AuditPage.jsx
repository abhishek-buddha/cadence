import { useState, useMemo } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  ShieldCheck,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Eye,
  Copy,
  Check,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ListToolbar, { ListToolbarButton } from '../components/ListToolbar';
import { useAuth, hasRole } from '../context/AuthContext';

const ACTION_OPTIONS = [
  { value: 'create', label: 'Create' },
  { value: 'read', label: 'Read' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'export', label: 'Export' },
];

const RESOURCE_OPTIONS = [
  { value: '', label: 'All Resources' },
  { value: 'claim', label: 'Claim' },
  { value: 'dental_case', label: 'Dental Case' },
  { value: 'patient', label: 'Patient' },
  { value: 'call', label: 'Call' },
  { value: 'session', label: 'Session' },
  { value: 'user', label: 'User' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'api_key', label: 'API Key' },
];

const PAGE_SIZE = 50;

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

function ActionChip({ action }) {
  const colors = {
    create: 'bg-success/10 text-success',
    read: 'bg-gray-500/10 text-gray-600',
    update: 'bg-accent/10 text-accent',
    delete: 'bg-danger/10 text-danger',
    login: 'bg-cyan/10 text-cyan',
    logout: 'bg-purple-500/10 text-purple-600',
    transfer: 'bg-warn/10 text-warn',
    export: 'bg-accent/10 text-accent',
  };
  const cls = colors[action] || 'bg-gray-500/10 text-gray-600';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded font-medium text-xs ${cls}`}>
      {action}
    </span>
  );
}

function RoleBadge({ role }) {
  const colors = {
    admin: 'bg-danger/10 text-danger',
    manager: 'bg-accent/10 text-accent',
    viewer: 'bg-gray-500/10 text-gray-600',
  };
  const cls = colors[role] || 'bg-gray-500/10 text-gray-600';
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${cls}`}>
      {role}
    </span>
  );
}

function CopyableId({ id }) {
  const [copied, setCopied] = useState(false);
  if (!id) return <span className="text-muted/50 italic">--</span>;

  const truncated = id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 font-data text-xs text-gray-600 hover:text-accent transition-colors"
      title={`Copy ${id}`}
    >
      <span>{truncated}</span>
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 opacity-50" />}
    </button>
  );
}

function ShimmerRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="shimmer rounded h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function AuditPage() {
  const auth = useAuth();
  const role = auth?.role;

  // Permission gate (admin and manager allowed per Sidebar config)
  if (!hasRole(role, 'manager')) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Lock}
            title="Admin only"
            description="You need admin or manager permissions to view the audit log. Contact your administrator if you need access."
          />
        </div>
      </div>
    );
  }

  return <AuditPageContent />;
}

function AuditPageContent() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [actionFilter, setActionFilter] = useState([]);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]); // stack of past cursors for "back"
  const [exporting, setExporting] = useState(false);

  const users = useQuery(api.users?.list);
  const exportCsv = useAction(api.auditEvents?.exportCsv);

  const queryArgs = useMemo(() => {
    const args = { limit: PAGE_SIZE };
    if (cursor) args.cursor = cursor;
    if (dateFrom) args.from = dateFrom;
    if (dateTo) args.to = dateTo;
    if (userIdFilter) args.userId = userIdFilter;
    if (actionFilter.length > 0) args.actions = actionFilter;
    if (resourceTypeFilter) args.resourceType = resourceTypeFilter;
    return args;
  }, [cursor, dateFrom, dateTo, userIdFilter, actionFilter, resourceTypeFilter]);

  const result = useQuery(api.auditEvents?.list, queryArgs);
  const isLoading = result === undefined;
  const events = result?.events ?? [];
  const nextCursor = result?.nextCursor ?? null;

  const userMap = useMemo(() => {
    const map = {};
    (users ?? []).forEach((u) => {
      map[u._id] = { email: u.email, role: u.role };
    });
    return map;
  }, [users]);

  // Client-side search across loaded page
  const filteredEvents = events.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const userEmail = userMap[e.userId]?.email || '';
    return (
      userEmail.toLowerCase().includes(q) ||
      (e.resourceId || '').toLowerCase().includes(q) ||
      (e.resourceType || '').toLowerCase().includes(q) ||
      (e.action || '').toLowerCase().includes(q)
    );
  });

  function toggleAction(value) {
    setActionFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
    resetPagination();
  }

  function resetPagination() {
    setCursor(null);
    setCursorStack([]);
  }

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, cursor]);
    setCursor(nextCursor);
  }

  function handlePrevPage() {
    if (cursorStack.length === 0) return;
    const prev = [...cursorStack];
    const last = prev.pop();
    setCursorStack(prev);
    setCursor(last);
  }

  async function handleExport() {
    if (!exportCsv) return;
    setExporting(true);
    try {
      const csvText = await exportCsv({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        userId: userIdFilter || undefined,
        actions: actionFilter.length > 0 ? actionFilter : undefined,
        resourceType: resourceTypeFilter || undefined,
      });
      // Trigger download
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cadence-audit-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Audit export failed:', err);
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  }

  const userOptions = [
    { value: '', label: 'All Users' },
    ...(users ?? []).map((u) => ({ value: u._id, label: u.email })),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-border rounded-xl p-4 shadow-sm">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); resetPagination(); }}
          className={`${INPUT_CLASS} w-40`}
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); resetPagination(); }}
          className={`${INPUT_CLASS} w-40`}
        />
        <FilterSelect
          value={userIdFilter}
          onChange={(v) => { setUserIdFilter(v); resetPagination(); }}
          options={userOptions}
          className="w-52"
        />
        <FilterSelect
          value={resourceTypeFilter}
          onChange={(v) => { setResourceTypeFilter(v); resetPagination(); }}
          options={RESOURCE_OPTIONS}
          className="w-44"
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setActionMenuOpen((o) => !o)}
            className={`${SELECT_CLASS} pr-8 w-44 cursor-pointer text-left`}
          >
            {actionFilter.length === 0
              ? 'All Actions'
              : `${actionFilter.length} action${actionFilter.length !== 1 ? 's' : ''}`}
          </button>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          {actionMenuOpen && (
            <div className="absolute z-50 right-0 mt-1 w-52 bg-white border border-border rounded-lg shadow-lg p-2">
              {ACTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={actionFilter.includes(opt.value)}
                    onChange={() => toggleAction(opt.value)}
                    className="rounded border-border-light text-accent focus:ring-accent"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              {actionFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setActionFilter([]); resetPagination(); }}
                  className="w-full text-left px-2 py-1.5 mt-1 text-xs text-muted hover:text-gray-700 border-t border-border"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action toolbar */}
      <ListToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      >
        <ListToolbarButton
          icon={Download}
          label={exporting ? 'Exporting...' : 'Export CSV'}
          onClick={handleExport}
          disabled={exporting || isLoading}
          variant="white"
        />
      </ListToolbar>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl overflow-auto max-h-[70vh] shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10 bg-table-header">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Timestamp</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">User</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Action</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Resource Type</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Resource ID</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">PHI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <ShimmerRow key={i} />)
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={ShieldCheck}
                    title="No audit events"
                    description={
                      dateFrom || dateTo || userIdFilter || actionFilter.length > 0 || resourceTypeFilter || searchQuery
                        ? 'Try adjusting your filters.'
                        : 'No audit events have been recorded yet.'
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => {
                const user = userMap[event.userId];
                return (
                  <tr key={event._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-xs text-gray-700 font-data whitespace-nowrap">
                      {formatTimestamp(event.timestamp || event._creationTime)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900">{user?.email ?? <span className="text-muted">unknown</span>}</span>
                        {user?.role && <RoleBadge role={user.role} />}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <ActionChip action={event.action} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {event.resourceType || <span className="text-muted/50 italic">--</span>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <CopyableId id={event.resourceId} />
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {event.phiAccessed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warn/10 text-warn">
                          <Eye className="w-3 h-3" />
                          PHI
                        </span>
                      ) : (
                        <span className="text-muted/40 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {!isLoading && events.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted">
              Page size: <span className="font-data text-gray-700">{PAGE_SIZE}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={cursorStack.length === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={!nextCursor}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
