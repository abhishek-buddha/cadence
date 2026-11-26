import { useState } from 'react';
import { Users, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import Modal from '../components/Modal';
import PatientEditor from '../components/PatientEditor';
import EmptyState from '../components/EmptyState';
import ListToolbar, { ListToolbarButton } from '../components/ListToolbar';
import { useProviderFilter } from '../context/ProviderFilterContext';
import { listPatients, deletePatient as apiDeletePatient } from '../api/masterData';
import { listClaims } from '../api/claims';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { getConfig } from '../features/appointments/api';

export default function PatientsPage() {
  const { selectedProviderId } = useProviderFilter();
  const { data: allPatients, loading: isLoading, refetch } = useLiveQuery(listPatients, [], 'patient');
  const { data: allClaims } = useLiveQuery(listClaims, [], 'claim');
  const { data: appointmentConfig } = useLiveQuery(getConfig, [], 'appointment-config');
  const phoneEnabled = appointmentConfig?.enabled;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [piiVisible, setPiiVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter patients by provider: show patients who have claims at the selected hospital
  const providerPatientIds = selectedProviderId && allClaims
    ? new Set(allClaims.filter((c) => String(c.provider_id) === String(selectedProviderId)).map((c) => c.patient_id))
    : null;
  const patients = selectedProviderId
    ? (allPatients ?? []).filter((p) => providerPatientIds?.has(p.id))
    : allPatients;

  const filteredPatients = (patients ?? []).filter((patient) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return [patient.first_name, patient.last_name, patient.member_id, patient.group_number]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(patient) {
    setEditing(patient);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this patient record? This cannot be undone.')) return;
    await apiDeletePatient(id);
    await refetch();
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

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in">
      {/* Action toolbar */}
      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery}>
        <ListToolbarButton
          icon={piiVisible ? Eye : EyeOff}
          label={piiVisible ? 'Hide PII' : 'Reveal PII'}
          onClick={() => setPiiVisible((v) => !v)}
          variant="white"
        />
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
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="sticky top-0 z-10 bg-table-header">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Name</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">DOB</th>
                  {phoneEnabled && <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Mobile</th>}
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Member ID</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Group #</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Relationship</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-table-header-text font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{mask(patient.first_name)} {mask(patient.last_name)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{maskDOB(patient.date_of_birth)}</td>
                    {phoneEnabled && <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{mask(patient.phone) || '--'}</td>}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-data text-accent">{mask(patient.member_id)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{mask(patient.group_number) ?? '--'}</td>
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
                          onClick={() => handleDelete(patient.id)}
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
        {modalOpen && <PatientEditor key={editing?.id ?? 'new'} patient={editing} phoneEnabled={phoneEnabled}
          onCancel={closeModal} onSaved={async () => { await refetch(); closeModal(); }} />}
      </Modal>
    </div>
  );
}
