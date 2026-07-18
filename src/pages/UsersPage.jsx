import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { UserCog, UserPlus, Lock, ChevronDown, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useAuth, hasRole } from '../context/AuthContext';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', color: 'bg-danger/10 text-danger' },
  { value: 'manager', label: 'Manager', color: 'bg-accent/10 text-accent' },
  { value: 'operator', label: 'Agent', color: 'bg-success/10 text-success' },
  { value: 'viewer', label: 'Viewer', color: 'bg-gray-500/10 text-gray-600' },
];

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

function getInitials(emailOrName) {
  if (!emailOrName) return '?';
  const trimmed = emailOrName.trim();
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ').filter(Boolean);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function avatarColor(seed) {
  const colors = [
    'bg-accent/15 text-accent',
    'bg-success/15 text-success',
    'bg-warn/15 text-warn',
    'bg-purple-500/15 text-purple-600',
    'bg-cyan/15 text-cyan',
    'bg-danger/15 text-danger',
  ];
  let hash = 0;
  for (let i = 0; i < (seed || '').length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function RoleBadge({ role }) {
  const cfg = ROLE_OPTIONS.find((r) => r.value === role);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.color || 'bg-gray-500/10 text-gray-600'}`}>
      {cfg?.label || role}
    </span>
  );
}

function RoleDropdown({ userId, currentRole, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  async function handleSelect(role) {
    setOpen(false);
    if (role === currentRole) return;
    setUpdating(true);
    try {
      await onChange(userId, role);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled || updating}
        className="inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RoleBadge role={currentRole} />
        {!disabled && <ChevronDown className="w-3 h-3 text-muted" />}
      </button>
      {open && (
        <div
          className="absolute z-50 left-0 top-full mt-1 bg-white border border-border-light rounded-lg shadow-xl shadow-gray-200/60 py-1 min-w-[140px] animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => handleSelect(r.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                r.value === currentRole
                  ? 'bg-accent/5 text-accent font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusToggle({ user, onToggle }) {
  const [updating, setUpdating] = useState(false);
  const enabled = user.status !== 'disabled';

  async function handleToggle(e) {
    e.stopPropagation();
    setUpdating(true);
    try {
      await onToggle(user._id, enabled ? 'disabled' : 'active');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={updating}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        enabled ? 'bg-accent' : 'bg-gray-300'
      } disabled:opacity-50`}
      title={enabled ? 'Click to disable' : 'Click to enable'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function formatLastLogin(ts) {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Invite User Modal
// ---------------------------------------------------------------------------
function InviteUserModal({ open, onClose, createUser }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setEmail('');
    setRole('viewer');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createUser({ email, role });
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to invite user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invite User">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-accent">Note:</strong> This records the user in the system. They will be
            able to sign in once SSO is configured for their email.
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className={INPUT_CLASS}
            required
            autoFocus
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Role</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  role === opt.value
                    ? 'bg-accent/5 border-accent text-accent'
                    : 'bg-white border-border hover:border-accent/40 text-gray-700'
                }`}
              >
                {opt.label}
              </button>
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
            className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Inviting...' : 'Invite User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function UsersPage() {
  const auth = useAuth();
  const role = auth?.role;

  if (!hasRole(role, 'admin')) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Users</h1>
          <p className="text-sm text-muted mt-1">Manage user access and roles</p>
        </div>
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Lock}
            title="Admin only"
            description="You need admin permissions to manage users. Contact your administrator if you need access."
          />
        </div>
      </div>
    );
  }

  return <UsersPageContent currentEmail={auth?.email} />;
}

function UsersPageContent({ currentEmail }) {
  const users = useQuery(api.users?.list);
  const updateRole = useMutation(api.users?.updateRole);
  const setStatus = useMutation(api.users?.setStatus);
  const createUser = useMutation(api.users?.create);
  const [inviteOpen, setInviteOpen] = useState(false);

  const isLoading = users === undefined;

  async function handleRoleChange(userId, role) {
    await updateRole({ id: userId, role });
  }

  async function handleStatusToggle(userId, status) {
    await setStatus({ id: userId, status });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Users</h1>
          <p className="text-sm text-muted mt-1">
            {!isLoading && `${users.length} user${users.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Invite User
        </button>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold w-12"></th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Email</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Active</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Last Login</th>
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
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={UserCog}
                    title="No users yet"
                    description="Invite your first team member to get started."
                    action={
                      <button
                        onClick={() => setInviteOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        Invite User
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const seed = user.name || user.email;
                const isSelf = user.email === currentEmail;
                return (
                  <tr key={user._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-display font-semibold ${avatarColor(seed)}`}
                      >
                        {getInitials(user.name || user.email)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-900 whitespace-nowrap font-medium">
                      {user.email}
                      {isSelf && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted bg-surface px-1.5 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {user.name || <span className="text-muted/50 italic">--</span>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <RoleDropdown
                        userId={user._id}
                        currentRole={user.role}
                        disabled={isSelf}
                        onChange={handleRoleChange}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {isSelf ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <StatusToggle user={user} onToggle={handleStatusToggle} />
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 font-data text-right whitespace-nowrap">
                      {formatLastLogin(user.lastLoginAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        createUser={createUser}
      />
    </div>
  );
}
