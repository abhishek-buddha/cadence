import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  KeyRound,
  Plus,
  Lock,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useAuth, hasRole } from '../context/AuthContext';

const ALL_SCOPES = [
  { value: 'read:claims', label: 'Read Claims' },
  { value: 'write:claims', label: 'Write Claims' },
  { value: 'read:cases', label: 'Read Cases' },
  { value: 'write:cases', label: 'Write Cases' },
  { value: 'read:calls', label: 'Read Calls' },
  { value: 'read:reports', label: 'Read Reports' },
  { value: 'write:webhooks', label: 'Manage Webhooks' },
  { value: 'admin', label: 'Admin (full access)' },
];

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

function ScopeChip({ scope }) {
  const isAdmin = scope === 'admin';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[11px] font-data font-medium ${
        isAdmin ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent'
      }`}
    >
      {scope}
    </span>
  );
}

function StatusPill({ status }) {
  const colors =
    status === 'revoked'
      ? 'bg-danger/10 text-danger'
      : status === 'active'
        ? 'bg-success/10 text-success'
        : 'bg-gray-500/10 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'revoked'
            ? 'bg-danger'
            : status === 'active'
              ? 'bg-success'
              : 'bg-gray-400'
        }`}
      />
      {status || 'unknown'}
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return 'Never';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Issue Key Modal
// ---------------------------------------------------------------------------
function IssueKeyModal({ open, onClose, issueKey }) {
  const [stage, setStage] = useState('form'); // form | issuing | display
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [issuedKey, setIssuedKey] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setStage('form');
    setName('');
    setSelectedScopes([]);
    setIssuedKey(null);
    setError(null);
    setCopied(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleScope(value) {
    setSelectedScopes((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || selectedScopes.length === 0) {
      setError('Name and at least one scope are required.');
      return;
    }
    setStage('issuing');
    setError(null);
    try {
      const result = await issueKey({ name: name.trim(), scopes: selectedScopes });
      setIssuedKey(result);
      setStage('display');
    } catch (err) {
      setError(err.message || 'Failed to issue API key.');
      setStage('form');
    }
  }

  async function handleCopy() {
    if (!issuedKey?.key) return;
    try {
      await navigator.clipboard.writeText(issuedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (stage === 'display' && issuedKey) {
    return (
      <Modal open={open} onClose={handleClose} title="API Key Issued" wide>
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-warn/10 border border-warn/20 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-warn shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-display font-semibold text-gray-900 mb-1">
                Save this key now — you will not see it again
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Store this key in a secure secret manager. If lost, you will need to revoke it and issue a new one.
              </p>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface border border-border rounded-lg px-3 py-2.5 text-sm font-data text-gray-900 break-all select-all">
                {issuedKey.key}
              </code>
              <button
                onClick={handleCopy}
                className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                  copied
                    ? 'bg-success/10 border-success text-success'
                    : 'bg-white border-border hover:border-accent text-muted hover:text-accent'
                }`}
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-muted uppercase tracking-wider font-medium mb-1">Name</p>
              <p className="text-gray-900">{name}</p>
            </div>
            <div>
              <p className="text-muted uppercase tracking-wider font-medium mb-1">Scopes</p>
              <div className="flex flex-wrap gap-1">
                {selectedScopes.map((s) => (
                  <ScopeChip key={s} scope={s} />
                ))}
              </div>
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
    <Modal open={open} onClose={handleClose} title="Issue New API Key" wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={LABEL_CLASS}>Key Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EHR integration, Production server"
            className={INPUT_CLASS}
            disabled={stage === 'issuing'}
            autoFocus
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Scopes</label>
          <p className="text-xs text-muted mb-2">
            Grant only the permissions this key needs. The <span className="font-data text-danger">admin</span> scope grants full access.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_SCOPES.map((scope) => (
              <label
                key={scope.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedScopes.includes(scope.value)
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                  disabled={stage === 'issuing'}
                  className="rounded border-border-light text-accent focus:ring-accent"
                />
                <div className="min-w-0">
                  <p className={`text-xs font-data ${scope.value === 'admin' ? 'text-danger' : 'text-gray-700'}`}>
                    {scope.value}
                  </p>
                  <p className="text-[11px] text-muted truncate">{scope.label}</p>
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
            disabled={stage === 'issuing'}
            className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={stage === 'issuing'}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" />
            {stage === 'issuing' ? 'Issuing...' : 'Issue Key'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function ApiKeysPage() {
  const auth = useAuth();
  const role = auth?.role;

  if (!hasRole(role, 'admin')) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">API Keys</h1>
          <p className="text-sm text-muted mt-1">Manage external API access</p>
        </div>
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Lock}
            title="Admin only"
            description="You need admin permissions to manage API keys."
          />
        </div>
      </div>
    );
  }

  return <ApiKeysPageContent />;
}

function ApiKeysPageContent() {
  const keys = useQuery(api.apiKeys?.list);
  const issueKey = useMutation(api.apiKeys?.issue);
  const revokeKey = useMutation(api.apiKeys?.revoke);
  const [issueOpen, setIssueOpen] = useState(false);
  const [revoking, setRevoking] = useState(null);

  const isLoading = keys === undefined;

  async function handleRevoke(key) {
    if (!window.confirm(`Revoke "${key.name}"? Any service using this key will immediately lose access. This cannot be undone.`)) {
      return;
    }
    setRevoking(key._id);
    try {
      await revokeKey({ id: key._id });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">API Keys</h1>
          <p className="text-sm text-muted mt-1">
            {!isLoading && `${keys.length} key${keys.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setIssueOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Issue New Key
        </button>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Prefix</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold">Scopes</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Last Used</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Status</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={KeyRound}
                    title="No API keys yet"
                    description="Issue an API key to enable external integrations."
                    action={
                      <button
                        onClick={() => setIssueOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Issue New Key
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key._id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 py-3.5 text-sm text-gray-900 whitespace-nowrap font-medium">
                    {key.name}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-data text-gray-700 whitespace-nowrap">
                    {key.prefix ? `${key.prefix}...${(key.lastFour || 'XXXX')}` : '--'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {(key.scopes || []).map((s) => (
                        <ScopeChip key={s} scope={s} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-600 font-data whitespace-nowrap">
                    {formatDate(key.lastUsedAt)}
                  </td>
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <StatusPill status={key.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {key.status !== 'revoked' && (
                      <button
                        onClick={() => handleRevoke(key)}
                        disabled={revoking === key._id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {revoking === key._id ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <IssueKeyModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        issueKey={issueKey}
      />
    </div>
  );
}
