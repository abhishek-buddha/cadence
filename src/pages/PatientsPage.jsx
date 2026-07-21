import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Users, Plus, Pencil, Trash2, ChevronDown, Eye, EyeOff } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import ListToolbar, { ListToolbarButton } from '../components/ListToolbar';
import { useProviderFilter } from '../context/ProviderFilterContext';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  memberId: '',
  groupNumber: '',
  policyNumber: '',
  subscriberName: '',
  relationship: 'self',
};

export default function PatientsPage() {
  const { selectedProviderId } = useProviderFilter();
  const allPatients = useQuery(api.patients.list);
  const allClaims = useQuery(api.claims.list);
  const createPatient = useMutation(api.patients.create);
  const updatePatient = useMutation(api.patients.update);
  const removePatient = useMutation(api.patients.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [piiVisible, setPiiVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = allPatients === undefined;

  // Filter patients by provider: show patients who have claims at the selected hospital
  const providerPatientIds = selectedProviderId && allClaims
    ? new Set(allClaims.filter((c) => c.providerId === selectedProviderId).map((c) => c.patientId))
    : null;
  const patients = selectedProviderId
    ? (allPatients ?? []).filter((p) => providerPatientIds?.has(p._id))
    : allPatients;

  const filteredPatients = (patients ?? []).filter((patient) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return [patient.firstName, patient.lastName, patient.memberId, patient.groupNumber]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(patient) {
    setEditing(patient);
    setForm({
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      memberId: patient.memberId,
      groupNumber: patient.groupNumber ?? '',
      policyNumber: patient.policyNumber ?? '',
      subscriberName: patient.subscriberName ?? '',
      relationship: patient.relationship ?? 'self',
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
        firstName: form.firstName,
        lastName: form.lastName,
        dateOfBirth: form.dateOfBirth,
        memberId: form.memberId,
        groupNumber: form.groupNumber || undefined,
        policyNumber: form.policyNumber || undefined,
        subscriberName: form.subscriberName || undefined,
        relationship: form.relationship || undefined,
      };

      if (editing) {
        await updatePatient({ id: editing._id, ...payload });
      } else {
        await createPatient(payload);
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this patient record? This cannot be undone.')) return;
    await removePatient({ id });
  }

  function formatDOB(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function mask(value) {
    if (piiVisible || !value) return value;
    if (value.length <= 2) return '***';
    return value[0] + '*'.repeat(Math.min(value.length - 2, 8)) + value[value.length - 1];
  }

  function maskDOB(dateStr) {
    if (piiVisible) return formatDOB(dateStr);
    return '*** **, ****';
  }

  const inputClass =
    'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
  const labelClass = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPiiVisible((v) => !v)}
              className={`p-1.5 rounded-lg transition-colors ${piiVisible ? 'text-accent bg-accent/10' : 'text-muted hover:text-gray-700 hover:bg-gray-100'}`}
              title={piiVisible ? 'Hide patient data' : 'Reveal patient data'}
            >
              {piiVisible ? <Eye className="w-4.5 h-4.5" /> : <EyeOff className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Action toolbar */}
      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery}>
        <ListToolbarButton icon={Plus} label="Add Patient" onClick={openCreate} />
      </ListToolbar>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Users}
            title={searchQuery ? 'No matching patients' : 'No patients yet'}
            description={
              searchQuery
                ? 'Try adjusting your search to find what you are looking for.'
                : 'Add your first patient record to get started with claims management.'
            }
            action={
              !searchQuery ? (
                <button onClick={openCreate} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Patient
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full">
              <thead>
                <tr className="sticky top-[var(--toolbar-h)] z-10 bg-table-header">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Name</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">DOB</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Member ID</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Group #</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Relationship</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-table-header-text font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredPatients.map((patient) => (
                  <tr key={patient._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{mask(patient.firstName)} {mask(patient.lastName)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{maskDOB(patient.dateOfBirth)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-data text-accent">{mask(patient.memberId)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{mask(patient.groupNumber) ?? '--'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{patient.relationship ?? '--'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(patient)}
                          className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(patient._id)}
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
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Patient' : 'Add Patient'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                className={inputClass}
                placeholder="Jane"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                className={inputClass}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <div className="relative">
                <select
                  value={form.relationship}
                  onChange={(e) => setField('relationship', e.target.value)}
                  className={`${inputClass} custom-select appearance-none pr-8 cursor-pointer`}
                >
                  <option value="self">Self</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Member ID</label>
              <input
                type="text"
                value={form.memberId}
                onChange={(e) => setField('memberId', e.target.value)}
                className={inputClass}
                placeholder="MBR-000000"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Group Number</label>
              <input
                type="text"
                value={form.groupNumber}
                onChange={(e) => setField('groupNumber', e.target.value)}
                className={inputClass}
                placeholder="GRP-0000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Policy Number</label>
              <input
                type="text"
                value={form.policyNumber}
                onChange={(e) => setField('policyNumber', e.target.value)}
                className={inputClass}
                placeholder="POL-000000"
              />
            </div>
            <div>
              <label className={labelClass}>Subscriber Name</label>
              <input
                type="text"
                value={form.subscriberName}
                onChange={(e) => setField('subscriberName', e.target.value)}
                className={inputClass}
                placeholder="Primary subscriber"
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
              {saving ? 'Saving...' : editing ? 'Update Patient' : 'Add Patient'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
