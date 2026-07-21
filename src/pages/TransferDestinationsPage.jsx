import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  PhoneForwarded,
  Plus,
  Pencil,
  Trash2,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import ListToolbar, { ListToolbarButton } from '../components/ListToolbar';
import { useAuth, hasRole } from '../context/AuthContext';

const KIND_OPTIONS = [
  { value: 'warm', label: 'Warm Transfer', description: 'Stay on line and announce caller' },
  { value: 'cold', label: 'Cold Transfer', description: 'Hand off without announcement' },
  { value: 'either', label: 'Either', description: 'Caller chooses at runtime' },
];

const PAYER_KIND_OPTIONS = [
  { value: 'medical', label: 'Medical' },
  { value: 'dental', label: 'Dental' },
  { value: 'both', label: 'Both' },
];

const EMPTY_FORM = {
  name: '',
  phone: '',
  kind: 'warm',
  businessHours: '',
  payerKind: 'both',
  applicableInsuranceContactIds: [],
  enabled: true,
};

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

function KindBadge({ kind }) {
  const colors = {
    warm: 'bg-success/10 text-success',
    cold: 'bg-warn/10 text-warn',
    either: 'bg-accent/10 text-accent',
  };
  const cls = colors[kind] || 'bg-gray-500/10 text-gray-600';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {kind || 'unknown'}
    </span>
  );
}

function EnabledToggle({ destination, onToggle }) {
  const [updating, setUpdating] = useState(false);

  async function handleToggle(e) {
    e.stopPropagation();
    setUpdating(true);
    try {
      await onToggle(destination._id, !destination.enabled);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={updating}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        destination.enabled ? 'bg-accent' : 'bg-gray-300'
      } disabled:opacity-50`}
      title={destination.enabled ? 'Click to disable' : 'Click to enable'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          destination.enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function formatPhone(phone) {
  if (!phone) return '--';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// ---------------------------------------------------------------------------
// Add/Edit Destination Modal
// ---------------------------------------------------------------------------
function DestinationModal({ open, onClose, editing, onSubmit }) {
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const [form, setForm] = useState(editing || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Re-sync form when `editing` changes
  const editingId = editing?._id;
  const formId = form?._id;
  if (editingId !== formId) {
    setForm(editing || EMPTY_FORM);
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleInsurance(id) {
    setForm((prev) => {
      const ids = prev.applicableInsuranceContactIds || [];
      return {
        ...prev,
        applicableInsuranceContactIds: ids.includes(id)
          ? ids.filter((i) => i !== id)
          : [...ids, id],
      };
    });
  }

  function handleClose() {
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to save destination.');
    } finally {
      setSaving(false);
    }
  }

  // Filter insurance contacts by chosen payerKind
  const filteredContacts = (insuranceContacts ?? []).filter((c) => {
    if (form.payerKind === 'both') return true;
    if (!c.payerKind) return true; // legacy contacts without payerKind
    return c.payerKind === form.payerKind || c.payerKind === 'both';
  });

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={editing ? 'Edit Transfer Destination' : 'Add Transfer Destination'}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Billing Specialist Line"
              className={INPUT_CLASS}
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Phone *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="+1 555 123 4567"
              className={INPUT_CLASS}
              required
            />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Kind</label>
          <div className="grid grid-cols-3 gap-2">
            {KIND_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  form.kind === opt.value
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={opt.value}
                  checked={form.kind === opt.value}
                  onChange={(e) => setField('kind', e.target.value)}
                  className="sr-only"
                />
                <p className={`text-sm font-medium mb-0.5 ${form.kind === opt.value ? 'text-accent' : 'text-gray-900'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-muted">{opt.description}</p>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Business Hours</label>
          <input
            type="text"
            value={form.businessHours}
            onChange={(e) => setField('businessHours', e.target.value)}
            placeholder="Mon-Fri 8am-6pm EST"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Payer Type</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYER_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField('payerKind', opt.value)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  form.payerKind === opt.value
                    ? 'border-accent bg-accent/5 text-accent'
                    : 'border-border hover:border-accent/40 bg-white text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>
            Applicable Payers <span className="text-muted normal-case font-normal tracking-normal">(leave empty to apply to all)</span>
          </label>
          <div className="border border-border-light rounded-lg max-h-48 overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">No payers available for this type.</p>
            ) : (
              filteredContacts.map((c) => {
                const checked = (form.applicableInsuranceContactIds || []).includes(c._id);
                return (
                  <label
                    key={c._id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-b-0 ${
                      checked ? 'bg-accent/5' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInsurance(c._id)}
                      className="rounded border-border-light text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-gray-700 flex-1">{c.name}</span>
                    {c.payerId && (
                      <span className="text-xs font-data text-muted">{c.payerId}</span>
                    )}
                  </label>
                );
              })
            )}
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
            {saving ? 'Saving...' : editing ? 'Update Destination' : 'Add Destination'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function TransferDestinationsPage() {
  const auth = useAuth();
  const role = auth?.role;

  if (!hasRole(role, 'manager')) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Transfer Destinations</h1>
          <p className="text-sm text-muted mt-1">Where calls can be transferred to a human</p>
        </div>
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Lock}
            title="Manager or admin only"
            description="You need manager or admin permissions to manage transfer destinations."
          />
        </div>
      </div>
    );
  }

  return <TransferDestinationsPageContent />;
}

function TransferDestinationsPageContent() {
  const destinations = useQuery(api.transferDestinations?.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const create = useMutation(api.transferDestinations?.create);
  const update = useMutation(api.transferDestinations?.update);
  const remove = useMutation(api.transferDestinations?.remove);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = destinations === undefined;
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });

  const filteredDestinations = (destinations ?? []).filter((dest) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesName = dest.name?.toLowerCase().includes(q);
    const matchesPhone = dest.phone?.toLowerCase().includes(q);
    const matchesKind = dest.kind?.toLowerCase().includes(q);
    const matchesHours = dest.businessHours?.toLowerCase().includes(q);
    const matchesPayers = (dest.applicableInsuranceContactIds || []).some((id) =>
      (insuranceMap[id] || '').toLowerCase().includes(q)
    );
    return matchesName || matchesPhone || matchesKind || matchesHours || matchesPayers;
  });

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(dest) {
    setEditing(dest);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSubmit(form) {
    const payload = {
      name: form.name,
      phone: form.phone,
      kind: form.kind,
      businessHours: form.businessHours || undefined,
      payerKind: form.payerKind,
      applicableInsuranceContactIds: form.applicableInsuranceContactIds || [],
      enabled: form.enabled !== false,
    };
    if (editing) {
      await update({ id: editing._id, ...payload });
    } else {
      await create(payload);
    }
  }

  async function handleToggleEnabled(id, enabled) {
    await update({ id, enabled });
  }

  async function handleDelete(dest) {
    if (!window.confirm(`Delete "${dest.name}"? This cannot be undone.`)) return;
    await remove({ id: dest._id });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Transfer Destinations</h1>
        <p className="text-sm text-muted mt-1">
          {!isLoading && `${filteredDestinations.length} destination${filteredDestinations.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery}>
        <ListToolbarButton icon={Plus} label="Add Destination" onClick={openCreate} />
      </ListToolbar>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Phone</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Kind</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Hours</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold">Applicable Payers</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Enabled</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredDestinations.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={PhoneForwarded}
                    title="No transfer destinations yet"
                    description={
                      searchQuery
                        ? 'Try adjusting your search to find what you are looking for.'
                        : 'Add destinations so the AI agent can warm-transfer calls to a human when needed.'
                    }
                    action={
                      !searchQuery ? (
                        <button
                          onClick={openCreate}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add Destination
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredDestinations.map((dest) => (
                <tr key={dest._id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 py-3.5 text-sm text-gray-900 whitespace-nowrap font-medium">{dest.name}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-700 font-data whitespace-nowrap">{formatPhone(dest.phone)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap"><KindBadge kind={dest.kind} /></td>
                  <td className="px-4 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                    {dest.businessHours || <span className="text-muted/50 italic">Always</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {(dest.applicableInsuranceContactIds || []).length === 0 ? (
                        <span className="text-xs text-muted/60 italic">All payers</span>
                      ) : (
                        (dest.applicableInsuranceContactIds || []).slice(0, 4).map((id) => (
                          <span
                            key={id}
                            className="inline-flex px-1.5 py-0.5 bg-accent/10 text-accent text-[11px] rounded"
                          >
                            {insuranceMap[id] || id.slice(-6)}
                          </span>
                        ))
                      )}
                      {(dest.applicableInsuranceContactIds || []).length > 4 && (
                        <span className="text-[11px] text-muted font-data">
                          +{dest.applicableInsuranceContactIds.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <EnabledToggle destination={dest} onToggle={handleToggleEnabled} />
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => openEdit(dest)}
                        className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(dest)}
                        className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
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

      <DestinationModal
        open={modalOpen}
        onClose={closeModal}
        editing={editing}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
