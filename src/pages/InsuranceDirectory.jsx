import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Building2, Plus, Pencil, Trash2, Phone } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const EMPTY_FORM = {
  name: '',
  phone: '',
  humanAgentNumber: '',
  department: '',
  payerId: '',
  hours: '',
  ivrInstructions: '',
  verificationRequirements: '',
  avgHoldTime: '',
  notes: '',
};

export default function InsuranceDirectory() {
  const contacts = useQuery(api.insuranceContacts.list);
  const createContact = useMutation(api.insuranceContacts.create);
  const updateContact = useMutation(api.insuranceContacts.update);
  const removeContact = useMutation(api.insuranceContacts.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isLoading = contacts === undefined;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(contact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      phone: contact.phone,
      humanAgentNumber: contact.humanAgentNumber ?? '',
      department: contact.department ?? '',
      payerId: contact.payerId ?? '',
      hours: contact.hours ?? '',
      ivrInstructions: contact.ivrInstructions ?? '',
      verificationRequirements: contact.verificationRequirements ?? '',
      avgHoldTime: contact.avgHoldTime != null ? String(contact.avgHoldTime) : '',
      notes: contact.notes ?? '',
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
        name: form.name,
        phone: form.phone,
        humanAgentNumber: form.humanAgentNumber || undefined,
        department: form.department || undefined,
        payerId: form.payerId || undefined,
        hours: form.hours || undefined,
        ivrInstructions: form.ivrInstructions || undefined,
        verificationRequirements: form.verificationRequirements || undefined,
        avgHoldTime: form.avgHoldTime ? Number(form.avgHoldTime) : undefined,
        notes: form.notes || undefined,
      };

      if (editing) {
        await updateContact({ id: editing._id, ...payload });
      } else {
        await createContact(payload);
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this insurance contact? This cannot be undone.')) return;
    await removeContact({ id });
  }

  function formatHoldTime(minutes) {
    if (minutes == null) return '--';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const inputClass =
    'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
  const labelClass = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Insurance Directory</h1>
          <p className="text-sm text-muted mt-1">
            {contacts ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <button onClick={openCreate} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          Add Insurance
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
      ) : contacts.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Building2}
            title="No insurance contacts yet"
            description="Build your insurance directory to streamline claims follow-up calls."
            action={
              <button onClick={openCreate} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Insurance
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
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Company Name</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Department</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Hours</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Avg Hold Time</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {contacts.map((contact) => (
                  <tr key={contact._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{contact.name}</span>
                      {contact.payerId && (
                        <span className="ml-2 text-xs font-data text-muted">({contact.payerId})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-data inline-flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-muted" />
                        {contact.phone}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.department ?? '--'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.hours ?? '--'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatHoldTime(contact.avgHoldTime)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(contact)}
                          className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(contact._id)}
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
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Insurance Contact' : 'Add Insurance Contact'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Company Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                className={inputClass}
                placeholder="Aetna, Blue Cross, etc."
                required
              />
            </div>
            <div>
              <label className={labelClass}>Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className={inputClass}
                placeholder="1-800-555-0100"
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Human Agent Number</label>
            <input
              type="tel"
              value={form.humanAgentNumber}
              onChange={(e) => setField('humanAgentNumber', e.target.value)}
              className={inputClass}
              placeholder="+918309838260 (forwarded after IVR)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setField('department', e.target.value)}
                className={inputClass}
                placeholder="Claims, Provider Relations, etc."
              />
            </div>
            <div>
              <label className={labelClass}>Payer ID</label>
              <input
                type="text"
                value={form.payerId}
                onChange={(e) => setField('payerId', e.target.value)}
                className={inputClass}
                placeholder="60054"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Hours of Operation</label>
              <input
                type="text"
                value={form.hours}
                onChange={(e) => setField('hours', e.target.value)}
                className={inputClass}
                placeholder="Mon-Fri 8am-6pm EST"
              />
            </div>
            <div>
              <label className={labelClass}>Avg Hold Time (minutes)</label>
              <input
                type="number"
                min="0"
                value={form.avgHoldTime}
                onChange={(e) => setField('avgHoldTime', e.target.value)}
                className={inputClass}
                placeholder="15"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>IVR Instructions</label>
            <textarea
              value={form.ivrInstructions}
              onChange={(e) => setField('ivrInstructions', e.target.value)}
              className={inputClass}
              rows={3}
              placeholder="Press 1 for provider services, then 3 for claims status..."
            />
          </div>

          <div>
            <label className={labelClass}>Verification Requirements</label>
            <textarea
              value={form.verificationRequirements}
              onChange={(e) => setField('verificationRequirements', e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="NPI, Tax ID, Member ID, DOB required..."
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="Additional notes..."
            />
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
              {saving ? 'Saving...' : editing ? 'Update Contact' : 'Add Contact'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
