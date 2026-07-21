import { useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Webhook,
  Plus,
  Lock,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Send,
  ChevronDown,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
} from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import ListToolbar, { ListToolbarButton } from '../components/ListToolbar';
import { useAuth, hasRole } from '../context/AuthContext';

const ALL_EVENTS = [
  { value: 'call.completed', label: 'Call completed' },
  { value: 'call.outcome_classified', label: 'Call outcome classified' },
  { value: 'case.created', label: 'Case created' },
  { value: 'session.completed', label: 'Session completed' },
  { value: 'transfer.initiated', label: 'Transfer initiated' },
  { value: 'webhook.test', label: 'Webhook test fire' },
];

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

function EventChip({ event }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-data font-medium bg-accent/10 text-accent">
      {event}
    </span>
  );
}

function StatusPill({ status }) {
  const config = {
    active: 'bg-success/10 text-success',
    paused: 'bg-warn/10 text-warn',
    revoked: 'bg-danger/10 text-danger',
  };
  const dotColor = {
    active: 'bg-success',
    paused: 'bg-warn',
    revoked: 'bg-danger',
  };
  const cls = config[status] || 'bg-gray-500/10 text-gray-600';
  const dot = dotColor[status] || 'bg-gray-400';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status || 'unknown'}
    </span>
  );
}

function DeliveryStatusBadge({ status, statusCode }) {
  const isSuccess = statusCode >= 200 && statusCode < 300;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-data ${
        isSuccess
          ? 'bg-success/10 text-success'
          : status === 'pending'
            ? 'bg-warn/10 text-warn'
            : 'bg-danger/10 text-danger'
      }`}
    >
      {statusCode || status || '--'}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function formatDate(ts) {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function truncateUrl(url, max = 40) {
  if (!url) return '--';
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + '...';
}

// ---------------------------------------------------------------------------
// Add Subscription Modal
// ---------------------------------------------------------------------------
function AddSubscriptionModal({ open, onClose, subscribe }) {
  const [stage, setStage] = useState('form'); // form | submitting | success
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  function reset() {
    setStage('form');
    setUrl('');
    setSelectedEvents([]);
    setCreated(null);
    setError(null);
    setCopiedSecret(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleEvent(value) {
    setSelectedEvents((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim() || selectedEvents.length === 0) {
      setError('URL and at least one event are required.');
      return;
    }
    let normalizedUrl;
    try {
      normalizedUrl = new URL(url.trim()).toString();
    } catch {
      setError('Please enter a valid URL (must include https://).');
      return;
    }
    setStage('submitting');
    setError(null);
    try {
      const result = await subscribe({ url: normalizedUrl, events: selectedEvents });
      setCreated(result);
      setStage('success');
    } catch (err) {
      setError(err.message || 'Failed to create subscription.');
      setStage('form');
    }
  }

  async function handleCopySecret() {
    if (!created?.secret) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (stage === 'success' && created) {
    return (
      <Modal open={open} onClose={handleClose} title="Subscription Created" wide>
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-warn/10 border border-warn/20 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-warn shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-display font-semibold text-gray-900 mb-1">
                Save this signing secret
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Use this secret to verify webhook signatures (HMAC-SHA256). It will not be shown again.
              </p>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Signing Secret</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface border border-border rounded-lg px-3 py-2.5 text-sm font-data text-gray-900 break-all select-all">
                {created.secret}
              </code>
              <button
                onClick={handleCopySecret}
                className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                  copiedSecret
                    ? 'bg-success/10 border-success text-success'
                    : 'bg-white border-border hover:border-accent text-muted hover:text-accent'
                }`}
                title="Copy to clipboard"
              >
                {copiedSecret ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-border">
            <button
              onClick={handleClose}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Webhook Subscription" wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={LABEL_CLASS}>Webhook URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com/webhooks/cadence"
            className={INPUT_CLASS}
            disabled={stage === 'submitting'}
            autoFocus
            required
          />
          <p className="text-xs text-muted mt-1.5">
            Cadence will POST event payloads to this URL.
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Events</label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_EVENTS.map((event) => (
              <label
                key={event.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedEvents.includes(event.value)
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(event.value)}
                  onChange={() => toggleEvent(event.value)}
                  disabled={stage === 'submitting'}
                  className="rounded border-border-light text-accent focus:ring-accent"
                />
                <div className="min-w-0">
                  <p className="text-xs font-data text-gray-700">{event.value}</p>
                  <p className="text-[11px] text-muted truncate">{event.label}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleClose}
            disabled={stage === 'submitting'}
            className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={stage === 'submitting'}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Webhook className="w-4 h-4" />
            {stage === 'submitting' ? 'Creating...' : 'Create Subscription'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Subscription Row (with expandable deliveries)
// ---------------------------------------------------------------------------
function SubscriptionRow({ subscription, onTestFire, onPause, onResume, onRevoke }) {
  const [expanded, setExpanded] = useState(false);
  const [testFiring, setTestFiring] = useState(false);
  const [actioning, setActioning] = useState(null);

  const deliveries = useQuery(
    api.webhooks?.listDeliveries,
    expanded && subscription?._id ? { subscriptionId: subscription._id, limit: 10 } : 'skip'
  );

  async function handleTestFire(e) {
    e.stopPropagation();
    setTestFiring(true);
    try {
      await onTestFire(subscription._id);
      // Show inline success-ish state
      setTimeout(() => setTestFiring(false), 1500);
    } catch (err) {
      console.error('Test fire failed:', err);
      setTestFiring(false);
      alert(`Test fire failed: ${err.message || 'Unknown error'}`);
    }
  }

  async function handleAction(e, action) {
    e.stopPropagation();
    setActioning(action);
    try {
      if (action === 'pause') await onPause(subscription._id);
      else if (action === 'resume') await onResume(subscription._id);
      else if (action === 'revoke') {
        if (!window.confirm('Revoke this webhook? It will stop receiving events.')) {
          setActioning(null);
          return;
        }
        await onRevoke(subscription._id);
      }
    } finally {
      setActioning(null);
    }
  }

  return (
    <>
      <tr
        className="hover:bg-gray-50/80 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="pl-4 pr-2 py-3.5 w-8">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted" />
          )}
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-900 font-data" title={subscription.url}>
              {truncateUrl(subscription.url)}
            </span>
            <CopyButton text={subscription.url} />
          </div>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex flex-wrap gap-1">
            {(subscription.events || []).map((e) => (
              <EventChip key={e} event={e} />
            ))}
          </div>
        </td>
        <td className="px-4 py-3.5 text-center whitespace-nowrap">
          <StatusPill status={subscription.status} />
        </td>
        <td className="px-4 py-3.5 text-xs text-gray-600 font-data whitespace-nowrap">
          {formatDate(subscription.lastDeliveryAt)}
          {subscription.lastDeliveryStatus != null && (
            <DeliveryStatusBadge status={subscription.lastDeliveryStatus} statusCode={subscription.lastDeliveryStatusCode} />
          )}
        </td>
        <td className="px-4 py-3.5 text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-1">
            {subscription.status !== 'revoked' && (
              <button
                onClick={handleTestFire}
                disabled={testFiring}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/10 rounded-lg transition-colors disabled:opacity-50"
                title="Send a test event"
              >
                <Send className="w-3.5 h-3.5" />
                {testFiring ? 'Sent' : 'Test Fire'}
              </button>
            )}
            {subscription.status === 'active' && (
              <button
                onClick={(e) => handleAction(e, 'pause')}
                disabled={actioning === 'pause'}
                className="p-1.5 text-warn hover:bg-warn/10 rounded-lg transition-colors disabled:opacity-50"
                title="Pause"
              >
                <PauseCircle className="w-4 h-4" />
              </button>
            )}
            {subscription.status === 'paused' && (
              <button
                onClick={(e) => handleAction(e, 'resume')}
                disabled={actioning === 'resume'}
                className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-50"
                title="Resume"
              >
                <PlayCircle className="w-4 h-4" />
              </button>
            )}
            {subscription.status !== 'revoked' && (
              <button
                onClick={(e) => handleAction(e, 'revoke')}
                disabled={actioning === 'revoke'}
                className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-50"
                title="Revoke"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface/40">
          <td colSpan={6} className="px-6 py-4">
            <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">Recent Deliveries</p>
            {deliveries === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="shimmer rounded h-7 w-full" />
                ))}
              </div>
            ) : (deliveries || []).length === 0 ? (
              <p className="text-sm text-muted/60 italic py-2">No deliveries yet. Click "Test Fire" to send a test event.</p>
            ) : (
              <div className="bg-white border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface">
                      <th className="px-3 py-2 text-left text-muted font-medium">Timestamp</th>
                      <th className="px-3 py-2 text-left text-muted font-medium">Event</th>
                      <th className="px-3 py-2 text-left text-muted font-medium">Status</th>
                      <th className="px-3 py-2 text-right text-muted font-medium">Latency</th>
                      <th className="px-3 py-2 text-right text-muted font-medium">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d._id} className="border-t border-border/40">
                        <td className="px-3 py-2 font-data text-gray-700">{formatDate(d.timestamp || d._creationTime)}</td>
                        <td className="px-3 py-2 font-data text-accent">{d.event}</td>
                        <td className="px-3 py-2">
                          <DeliveryStatusBadge status={d.status} statusCode={d.statusCode} />
                        </td>
                        <td className="px-3 py-2 text-right font-data text-gray-700">
                          {d.latencyMs != null ? `${d.latencyMs}ms` : '--'}
                        </td>
                        <td className="px-3 py-2 text-right font-data text-gray-700">
                          {d.attempts || 1}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function WebhooksPage() {
  const auth = useAuth();
  const role = auth?.role;

  if (!hasRole(role, 'manager')) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted mt-1">External event subscriptions</p>
        </div>
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Lock}
            title="Manager or admin only"
            description="You need manager or admin permissions to manage webhooks."
          />
        </div>
      </div>
    );
  }

  return <WebhooksPageContent />;
}

function WebhooksPageContent() {
  const subscriptions = useQuery(api.webhooks?.list);
  const subscribe = useMutation(api.webhooks?.subscribe);
  const pause = useMutation(api.webhooks?.pause);
  const resume = useMutation(api.webhooks?.resume);
  const revoke = useMutation(api.webhooks?.revoke);
  const testFire = useAction(api.webhooks?.testFire);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = subscriptions === undefined;

  const filteredSubscriptions = (subscriptions ?? []).filter((sub) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesUrl = sub.url?.toLowerCase().includes(q);
    const matchesEvents = (sub.events || []).some((e) => e.toLowerCase().includes(q));
    const matchesStatus = sub.status?.toLowerCase().includes(q);
    return matchesUrl || matchesEvents || matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted mt-1">
          {!isLoading && `${filteredSubscriptions.length} subscription${filteredSubscriptions.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery}>
        <ListToolbarButton icon={Plus} label="Add Subscription" onClick={() => setAddOpen(true)} />
      </ListToolbar>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header">
              <th className="pl-4 pr-2 py-3.5 w-8"></th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">URL</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold">Events</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Last Delivery</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredSubscriptions.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Webhook}
                    title="No webhook subscriptions yet"
                    description={
                      searchQuery
                        ? 'Try adjusting your search to find what you are looking for.'
                        : 'Subscribe to events to integrate Cadence with your downstream systems.'
                    }
                    action={
                      !searchQuery ? (
                        <button
                          onClick={() => setAddOpen(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add Subscription
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredSubscriptions.map((sub) => (
                <SubscriptionRow
                  key={sub._id}
                  subscription={sub}
                  onTestFire={(id) => testFire({ subscriptionId: id })}
                  onPause={(id) => pause({ id })}
                  onResume={(id) => resume({ id })}
                  onRevoke={(id) => revoke({ id })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddSubscriptionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        subscribe={subscribe}
      />
    </div>
  );
}
