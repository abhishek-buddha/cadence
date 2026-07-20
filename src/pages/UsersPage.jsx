import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { UserCog, UserPlus, Pencil, Lock, ChevronDown, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useAuth, hasRole } from '../context/AuthContext';
import { SPECIALIZATION_OPTIONS, SPECIALIZATION_LABELS } from '../constants/specializations';
import UserGroupsTab from '../components/UserGroupsTab';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', color: 'bg-danger/10 text-danger' },
  { value: 'operator', label: 'Operator', color: 'bg-success/10 text-success' },
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
// Add / Edit User Modal
// ---------------------------------------------------------------------------
const EMPTY_FORM = {
  email: '',
  name: '',
  role: 'operator',
  insuranceContactIds: [],
  providerIds: [],
  specializations: [],
  teamLeadName: '',
  userGroupId: null,
};

const SELECT_TABS = [
  { key: 'payer', label: 'Payer' },
  { key: 'provider', label: 'Provider' },
];

const ASSIGNMENT_MODES = [
  { key: 'group', label: 'User Group' },
  { key: 'custom', label: 'Custom' },
];

function UserModal({ open, onClose, editing, insuranceContacts, providers, userGroups, createUser, updateUser }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectTab, setSelectTab] = useState('payer');
  const [assignmentMode, setAssignmentMode] = useState('custom');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectTab('payer');
    setForm(
      editing
        ? {
            email: editing.email,
            name: editing.name ?? '',
            role: editing.role,
            insuranceContactIds: editing.insuranceContactIds ?? [],
            providerIds: editing.providerIds ?? [],
            specializations: editing.specializations ?? [],
            teamLeadName: editing.teamLeadName ?? '',
            userGroupId: editing.userGroupId ?? null,
          }
        : EMPTY_FORM
    );
    setAssignmentMode(editing?.userGroupId ? 'group' : 'custom');
  }, [open, editing]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleInsurance(id) {
    setForm((prev) => ({
      ...prev,
      insuranceContactIds: prev.insuranceContactIds.includes(id)
        ? prev.insuranceContactIds.filter((i) => i !== id)
        : [...prev.insuranceContactIds, id],
    }));
  }

  function toggleProvider(id) {
    setForm((prev) => ({
      ...prev,
      providerIds: prev.providerIds.includes(id)
        ? prev.providerIds.filter((i) => i !== id)
        : [...prev.providerIds, id],
    }));
  }

  function toggleSpecialization(value) {
    setForm((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(value)
        ? prev.specializations.filter((s) => s !== value)
        : [...prev.specializations, value],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!editing && (!form.email || !form.email.includes('@'))) {
      setError('Please enter a valid email address.');
      return;
    }
    if (assignmentMode === 'group' && !form.userGroupId) {
      setError('Please select a user group.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const routingPayload = {
        name: form.name.trim() || undefined,
        role: form.role,
        insuranceContactIds: form.insuranceContactIds,
        providerIds: form.providerIds,
        specializations: form.specializations,
        teamLeadName: form.teamLeadName.trim() || undefined,
        userGroupId: assignmentMode === 'group' ? form.userGroupId : null,
      };
      if (editing) {
        await updateUser({ id: editing._id, ...routingPayload });
      } else {
        await createUser({ email: form.email, ...routingPayload });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit User' : 'Add User'} wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        {!editing && (
          <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong className="text-accent">Note:</strong> This records the user in the system. They will be
              able to sign in once SSO is configured for their email.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="user@example.com"
              className={INPUT_CLASS}
              required
              autoFocus={!editing}
              disabled={!!editing}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="A. Reyes"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Role</label>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField('role', opt.value)}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  form.role === opt.value
                    ? 'bg-accent/5 border-accent text-accent'
                    : 'bg-white border-border hover:border-accent/40 text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Assignment</label>
          <div className="grid grid-cols-2 gap-2">
            {ASSIGNMENT_MODES.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setAssignmentMode(opt.key)}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  assignmentMode === opt.key
                    ? 'bg-accent/5 border-accent text-accent'
                    : 'bg-white border-border hover:border-accent/40 text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {assignmentMode === 'group' ? (
          <div>
            <label className={LABEL_CLASS}>User Group</label>
            {(userGroups ?? []).length === 0 ? (
              <p className="text-xs text-muted italic">No user groups yet — create one from the User Groups tab.</p>
            ) : (
              <select
                value={form.userGroupId ?? ''}
                onChange={(e) => setField('userGroupId', e.target.value || null)}
                className={INPUT_CLASS}
              >
                <option value="" disabled>Select a group...</option>
                {userGroups.map((g) => (
                  <option key={g._id} value={g._id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className={LABEL_CLASS}>Specialization</label>
              <div className="grid grid-cols-3 gap-2">
                {SPECIALIZATION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      form.specializations.includes(opt.value)
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/40 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.specializations.includes(opt.value)}
                      onChange={() => toggleSpecialization(opt.value)}
                      className="rounded border-border-light text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Payer / Provider this user can handle</label>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-1 border-b border-border bg-surface px-2">
                  {SELECT_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectTab(tab.key)}
                      className={`relative px-3 py-2 text-xs font-medium transition-colors ${
                        selectTab === tab.key ? 'text-accent' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {tab.label}
                      {tab.key === 'payer' && form.insuranceContactIds.length > 0 && (
                        <span className="ml-1.5 text-[10px] text-muted">({form.insuranceContactIds.length})</span>
                      )}
                      {tab.key === 'provider' && form.providerIds.length > 0 && (
                        <span className="ml-1.5 text-[10px] text-muted">({form.providerIds.length})</span>
                      )}
                      {selectTab === tab.key && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="p-3">
                  {selectTab === 'payer' && (
                    (insuranceContacts ?? []).length === 0 ? (
                      <p className="text-xs text-muted italic">No payers in Master Data yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {(insuranceContacts ?? []).map((c) => (
                          <label
                            key={c._id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              form.insuranceContactIds.includes(c._id)
                                ? 'border-accent bg-accent/5'
                                : 'border-border hover:border-accent/40 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={form.insuranceContactIds.includes(c._id)}
                              onChange={() => toggleInsurance(c._id)}
                              className="rounded border-border-light text-accent focus:ring-accent"
                            />
                            <span className="text-sm text-gray-700 truncate">{c.name}</span>
                          </label>
                        ))}
                      </div>
                    )
                  )}

                  {selectTab === 'provider' && (
                    (providers ?? []).length === 0 ? (
                      <p className="text-xs text-muted italic">No providers in Master Data yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {(providers ?? []).map((p) => (
                          <label
                            key={p._id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              form.providerIds.includes(p._id)
                                ? 'border-accent bg-accent/5'
                                : 'border-border hover:border-accent/40 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={form.providerIds.includes(p._id)}
                              onChange={() => toggleProvider(p._id)}
                              className="rounded border-border-light text-accent focus:ring-accent"
                            />
                            <span className="text-sm text-gray-700 truncate">{p.practiceName}</span>
                          </label>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <div>
          <label className={LABEL_CLASS}>Team Lead</label>
          <input
            value={form.teamLeadName}
            onChange={(e) => setField('teamLeadName', e.target.value)}
            placeholder="K. Nolan"
            className={INPUT_CLASS}
          />
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
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}
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

const TOP_TABS = [
  { key: 'users', label: 'Users' },
  { key: 'groups', label: 'User Groups' },
];

function UsersPageContent({ currentEmail }) {
  const [topTab, setTopTab] = useState('users');
  const users = useQuery(api.users?.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const providers = useQuery(api.providers.list);
  const userGroups = useQuery(api.userGroups.list);
  const updateRole = useMutation(api.users?.updateRole);
  const setStatus = useMutation(api.users?.setStatus);
  const createUser = useMutation(api.users?.create);
  const updateUser = useMutation(api.users?.updateRoutingProfile);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const isLoading = users === undefined;
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });
  const providerMap = {};
  (providers ?? []).forEach((p) => { providerMap[p._id] = p.practiceName; });
  const groupMap = {};
  (userGroups ?? []).forEach((g) => { groupMap[g._id] = g; });

  // A user assigned to a group has their Payer/Provider/Specialization scope
  // resolved from the group instead of their own (mutually exclusive) fields.
  function resolvedInsuranceIds(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.insuranceContactIds ?? []) : (user.insuranceContactIds ?? []);
  }
  function resolvedProviderIds(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.providerIds ?? []) : (user.providerIds ?? []);
  }
  function resolvedSpecializations(user) {
    return user.userGroupId ? (groupMap[user.userGroupId]?.specializations ?? []) : (user.specializations ?? []);
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(user) {
    setEditing(user);
    setModalOpen(true);
  }

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
            {topTab === 'users' && !isLoading && `${users.length} user${users.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {topTab === 'users' && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-white border border-border rounded-xl px-2 shadow-sm overflow-x-auto">
        {TOP_TABS.map((tab) => {
          const isActive = topTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTopTab(tab.key)}
              className={`relative inline-flex items-center px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'text-accent' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {topTab === 'groups' ? (
        <UserGroupsTab />
      ) : (
      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold w-12"></th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Email</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">User Group</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Payer</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Provider</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Specialization</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Team Lead</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Active</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Last Login</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 12 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState
                    icon={UserCog}
                    title="No users yet"
                    description="Add your first team member to get started."
                    action={
                      <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        Add User
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const seed = user.name || user.email;
                const isSelf = user.email === currentEmail;
                const insuranceNames = resolvedInsuranceIds(user).map((id) => insuranceMap[id]).filter(Boolean);
                const providerNames = resolvedProviderIds(user).map((id) => providerMap[id]).filter(Boolean);
                const specLabels = resolvedSpecializations(user).map((s) => SPECIALIZATION_LABELS[s] ?? s);
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
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                      {user.userGroupId
                        ? (groupMap[user.userGroupId]?.name ?? <span className="text-muted/50 italic">Deleted group</span>)
                        : <span className="text-muted/50 italic">Custom</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {insuranceNames.length > 0 ? insuranceNames.join(', ') : (user.role === 'operator' ? 'All payers' : '--')}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {providerNames.length > 0 ? providerNames.join(', ') : (user.role === 'operator' ? 'All providers' : '--')}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {specLabels.length > 0 ? specLabels.join(', ') : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{user.teamLeadName || '--'}</td>
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
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      <UserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        insuranceContacts={insuranceContacts}
        providers={providers}
        userGroups={userGroups}
        createUser={createUser}
        updateUser={updateUser}
      />
    </div>
  );
}
