import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { UserCog, UserPlus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'supervisor', label: 'Supervisor' },
];

const SPECIALIZATION_OPTIONS = [
  { value: 'claim_manager', label: 'Claim Manager' },
  { value: 'denial_handling', label: 'Denial Handling' },
  { value: 'followup', label: 'Followup' },
];

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy in call' },
  { value: 'offline', label: 'Offline' },
];

const AVAILABILITY_CONFIG = {
  available: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Available' },
  busy: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'Busy in call' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-400', label: 'Offline' },
};

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

function AvailabilityBadge({ value }) {
  const cfg = AVAILABILITY_CONFIG[value] ?? AVAILABILITY_CONFIG.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium px-2 py-0.5 text-xs ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const cfg = ROLE_OPTIONS.find((r) => r.value === role);
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent">
      {cfg?.label || role}
    </span>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface text-gray-600 border border-border">
      {children}
    </span>
  );
}

function StatusToggle({ agent, onToggle }) {
  const [updating, setUpdating] = useState(false);
  const enabled = agent.status !== 'inactive';

  async function handleToggle(e) {
    e.stopPropagation();
    setUpdating(true);
    try {
      await onToggle(agent._id, enabled ? 'inactive' : 'active');
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
      title={enabled ? 'Click to deactivate' : 'Click to activate'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Modal
// ---------------------------------------------------------------------------
const EMPTY_FORM = {
  name: '',
  username: '',
  role: 'agent',
  status: 'active',
  availability: 'available',
  specializations: [],
  insuranceContactIds: [],
};

function AgentModal({ open, onClose, editing, insuranceContacts, createAgent, updateAgent }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset the form to match whichever target (or blank, for "Add") each time the modal opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? {
            name: editing.name,
            username: editing.username,
            role: editing.role,
            status: editing.status,
            availability: editing.availability,
            specializations: editing.specializations ?? [],
            insuranceContactIds: editing.insuranceContactIds ?? [],
          }
        : EMPTY_FORM
    );
  }, [open, editing]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSpecialization(value) {
    setForm((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(value)
        ? prev.specializations.filter((s) => s !== value)
        : [...prev.specializations, value],
    }));
  }

  function toggleInsurance(id) {
    setForm((prev) => ({
      ...prev,
      insuranceContactIds: prev.insuranceContactIds.includes(id)
        ? prev.insuranceContactIds.filter((i) => i !== id)
        : [...prev.insuranceContactIds, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim()) {
      setError('Name and username are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        username: form.username.trim(),
        role: form.role,
        status: form.status,
        availability: form.availability,
        specializations: form.specializations,
        insuranceContactIds: form.insuranceContactIds,
      };
      if (editing) {
        await updateAgent({ id: editing._id, ...payload });
      } else {
        await createAgent(payload);
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Name</label>
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className={INPUT_CLASS}
              placeholder="A. Reyes"
              required
              autoFocus
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Username</label>
            <input
              value={form.username}
              onChange={(e) => setField('username', e.target.value)}
              className={INPUT_CLASS}
              placeholder="a.reyes"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Role</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setField('role', opt.value)}
                  className={`p-2.5 rounded-lg border text-sm font-medium transition-colors ${
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
            <label className={LABEL_CLASS}>Availability</label>
            <select
              value={form.availability}
              onChange={(e) => setField('availability', e.target.value)}
              className={`${INPUT_CLASS} custom-select cursor-pointer`}
            >
              {AVAILABILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Active</label>
          <button
            type="button"
            onClick={() => setField('status', form.status === 'active' ? 'inactive' : 'active')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.status === 'active' ? 'bg-accent' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.status === 'active' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="ml-3 text-sm text-gray-600 align-middle">
            {form.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </div>

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
          <label className={LABEL_CLASS}>Insurance companies this user can handle</label>
          {(insuranceContacts ?? []).length === 0 ? (
            <p className="text-xs text-muted italic">No insurance companies in Master Data yet.</p>
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
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors">
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
export default function CallAgentsPage() {
  const agents = useQuery(api.callAgents.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const createAgent = useMutation(api.callAgents.create);
  const updateAgent = useMutation(api.callAgents.update);
  const removeAgent = useMutation(api.callAgents.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const isLoading = agents === undefined;
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(agent) {
    setEditing(agent);
    setModalOpen(true);
  }

  async function handleDelete(agent) {
    if (!window.confirm(`Remove ${agent.name}?`)) return;
    setDeletingId(agent._id);
    try {
      await removeAgent({ id: agent._id });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusToggle(id, status) {
    await updateAgent({ id, status });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-sm text-muted mt-1">
            {!isLoading && `${agents.length} user${agents.length !== 1 ? 's' : ''} — pick up calls once a payer rep is on the line`}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Username</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Role</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Specialization</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Insurance</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Availability</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Active</th>
              <th className="text-right px-5 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="shimmer rounded h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon={UserCog}
                    title="No users yet"
                    description="Add the people who pick up calls once a payer representative is on the line."
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
              agents.map((agent) => (
                <tr key={agent._id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5 text-gray-900 font-medium whitespace-nowrap">{agent.name}</td>
                  <td className="px-4 py-3.5 text-gray-600 font-data whitespace-nowrap">{agent.username}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap"><RoleBadge role={agent.role} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(agent.specializations ?? []).length === 0 ? (
                        <span className="text-muted/50 italic text-xs">--</span>
                      ) : (
                        agent.specializations.map((s) => (
                          <Chip key={s}>{SPECIALIZATION_OPTIONS.find((o) => o.value === s)?.label ?? s}</Chip>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(agent.insuranceContactIds ?? []).length === 0 ? (
                        <span className="text-muted/50 italic text-xs">--</span>
                      ) : agent.insuranceContactIds.length > 2 ? (
                        <Chip>{agent.insuranceContactIds.length} payers</Chip>
                      ) : (
                        agent.insuranceContactIds.map((id) => (
                          <Chip key={id}>{insuranceMap[id] ?? '--'}</Chip>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap"><AvailabilityBadge value={agent.availability} /></td>
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <StatusToggle agent={agent} onToggle={handleStatusToggle} />
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => openEdit(agent)}
                        className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(agent)}
                        disabled={deletingId === agent._id}
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        insuranceContacts={insuranceContacts}
        createAgent={createAgent}
        updateAgent={updateAgent}
      />
    </div>
  );
}
