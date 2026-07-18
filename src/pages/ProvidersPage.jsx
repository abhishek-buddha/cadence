import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Stethoscope, Plus, Pencil, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const EMPTY_FORM = {
  practiceName: '',
  npi: '',
  taxId: '',
  address: '',
  phone: '',
  specialty: '',
};

export default function ProvidersPage() {
  const providers = useQuery(api.providers.list);
  const createProvider = useMutation(api.providers.create);
  const updateProvider = useMutation(api.providers.update);
  const removeProvider = useMutation(api.providers.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isLoading = providers === undefined;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(provider) {
    setEditing(provider);
    setForm({
      practiceName: provider.practiceName,
      npi: provider.npi,
      taxId: provider.taxId,
      address: provider.address,
      phone: provider.phone,
      specialty: provider.specialty ?? '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        practiceName: form.practiceName,
        npi: form.npi,
        taxId: form.taxId,
        address: form.address,
        phone: form.phone,
        specialty: form.specialty || undefined,
      };

      if (editing) {
        await updateProvider({ id: editing._id, ...payload });
      } else {
        await createProvider(payload);
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this hospital? This cannot be undone.')) return;
    await removeProvider({ id });
  }

  const inputClass =
    'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
  const labelClass = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Hospitals</h1>
          <p className="text-sm text-muted mt-1">
            {providers ? `${providers.length} hospital${providers.length !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <button onClick={openCreate} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          Add Hospital
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Stethoscope}
            title="No hospitals yet"
            description="Add hospital information for insurance verification calls."
            action={
              <button onClick={openCreate} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Hospital
              </button>
            }
          />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Practice Name</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">NPI</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Tax ID</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Address</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Specialty</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {providers.map((provider) => (
                  <tr key={provider._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{provider.practiceName}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-data text-accent">{provider.npi}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-data">{provider.taxId}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={provider.address}>{provider.address || '--'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-data">{provider.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{provider.specialty ?? '--'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(provider)}
                          className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(provider._id)}
                          className="px-3 py-1.5 text-danger hover:bg-danger/10 rounded-lg text-sm transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Hospital' : 'Add Hospital'}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className={labelClass}>Practice Name</label>
            <input
              type="text"
              value={form.practiceName}
              onChange={(e) => setField('practiceName', e.target.value)}
              className={inputClass}
              placeholder="Springfield Medical Group"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>NPI</label>
              <input
                type="text"
                value={form.npi}
                onChange={(e) => setField('npi', e.target.value)}
                className={inputClass}
                placeholder="1234567890"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Tax ID</label>
              <input
                type="text"
                value={form.taxId}
                onChange={(e) => setField('taxId', e.target.value)}
                className={inputClass}
                placeholder="12-3456789"
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              className={inputClass}
              placeholder="123 Medical Pkwy, Suite 200, City, ST 12345"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className={inputClass}
                placeholder="(555) 123-4567"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Specialty</label>
              <input
                type="text"
                value={form.specialty}
                onChange={(e) => setField('specialty', e.target.value)}
                className={inputClass}
                placeholder="Family Medicine"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2.5 text-sm text-muted hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Update Hospital' : 'Add Hospital'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
