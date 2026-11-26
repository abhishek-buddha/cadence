import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Calendar } from 'lucide-react';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import ListToolbar, { ListToolbarButton } from '../../components/ListToolbar';
import ListTable from '../../components/case/ListTable';
import EmptyState from '../../components/EmptyState';
import AppointmentForm from './AppointmentForm';
import StatusPicker from './StatusPicker';
import { listAppointments, updateAppointmentStatus } from './api';
import { appointmentTime, callTime, appointmentCallStatus } from './format';

const appointmentOptions = [['scheduled', 'Scheduled'], ['rescheduled', 'Rescheduled'], ['cancelled', 'Cancelled']];
const callOptions = [['not_called', 'Not Called'], ['completed', 'Completed'], ['no_answer', 'No Answer'], ['failed', 'Failed'], ['callback_needed', 'Callback Needed']];
const callFilterOptions = [callOptions[0], ['initiating', 'Initiating'], ['ringing', 'Ringing'], ['in_progress', 'In Progress'], ...callOptions.slice(1)];

export default function AppointmentList() {
  const { data, loading, error, refetch } = useLiveQuery(listAppointments, [], 'appointment');
  const [search, setSearch] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState('');
  const navigate = useNavigate();
  async function changeStatus(id, field, value) {
    if (saving) return;
    setSaving(true); setStatusError('');
    try { await updateAppointmentStatus(id, field, value); await refetch(); }
    catch (err) { setStatusError(err.message); }
    finally { setSaving(false); }
  }
  const statusDisabled = r => saving || ['initiating', 'ringing', 'in_progress'].includes(r.last_call_status);
  useEffect(() => {
    const timer = setInterval(refetch, 5000);
    return () => clearInterval(timer);
  }, [refetch]);
  const filtered = search || bookingStatus || callStatus;
  const rows = (data || []).filter(r =>
    (!bookingStatus || r.status === bookingStatus) &&
    (!callStatus || appointmentCallStatus(r) === callStatus) &&
    Object.values(r).some(v => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(search.toLowerCase())));
  const columns = [
    { key: 'patient_name', label: 'Patient Name', render: r => <Link to={`/appointments/${r.id}`} className="text-accent font-medium hover:underline focus-visible:outline focus-visible:outline-accent">{r.patient_name}</Link> },
    { key: 'status', label: 'Appointment Status', render: r => <StatusPicker value={r.status} options={appointmentOptions} label={`Appointment status for ${r.patient_name}`} disabled={statusDisabled(r)} onChange={value => changeStatus(r.id, 'appointment_status', value)} /> },
    { key: 'last_call_status', label: 'Call Status', render: r => <StatusPicker value={appointmentCallStatus(r)} options={callOptions} label={`Call status for ${r.patient_name}`} disabled={statusDisabled(r)} onChange={value => changeStatus(r.id, 'call_status', value)} /> },
    { key: 'scheduled_at', label: 'Appointment Date/Time', render: r => <span title={r.timezone}>{appointmentTime(r)}</span> },
    { key: 'provider_name', label: 'Provider' },
    { key: 'location', label: 'Location' },
    { key: 'appointment_type', label: 'Appointment Type' },
    { key: 'patient_id', label: 'Patient ID' },
    { key: 'confirmed_at', label: 'Attendance', render: r => r.status === 'cancelled' ? 'Not applicable' : r.confirmed_at ? 'Confirmed' : 'Not confirmed' },
    { key: 'call_attempts', label: 'Call Attempts', align: 'center' },
    { key: 'last_attempt', label: 'Last Attempt', render: r => <span title={r.timezone}>{callTime(r.last_attempt, r.timezone)}</span> },
    { key: 'assigned_agent_name', label: 'Assigned To' },
  ];
  return <div className="h-full flex flex-col space-y-4 animate-fade-in">
    <ListToolbar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search patients, providers, or status" filters={<div className="flex items-center gap-3 flex-wrap">
      <select aria-label="Appointment status" value={bookingStatus} onChange={e => setBookingStatus(e.target.value)} className="rounded-full border border-border-light bg-white py-2 pl-3 pr-8 text-xs text-gray-700 focus:ring-accent">
        <option value="">All appointment statuses</option>
        {appointmentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="Call status" value={callStatus} onChange={e => setCallStatus(e.target.value)} className="rounded-full border border-border-light bg-white py-2 pl-3 pr-8 text-xs text-gray-700 focus:ring-accent">
        <option value="">All call statuses</option>
        {callFilterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {filtered && <button className="text-xs text-white underline underline-offset-4 rounded focus-visible:outline focus-visible:outline-white" onClick={() => { setSearch(''); setBookingStatus(''); setCallStatus(''); }}>Clear filters</button>}
    </div>}>
      <ListToolbarButton icon={Plus} label="Create appointment" onClick={() => setEditing(true)} disabled={editing} />
    </ListToolbar>
    {editing && <AppointmentForm onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />}
    {loading && <p role="status">Loading appointments…</p>}
    {saving && <p role="status" className="text-sm text-muted">Saving status…</p>}
    {statusError && <p role="alert" className="text-danger">{statusError}</p>}
    {error && <div role="alert" className="text-danger">{error.message} <button className="underline" onClick={refetch}>Retry</button></div>}
    {!loading && !error && <ListTable columns={columns} rows={rows} getRowKey={r => r.id} onRowClick={r => navigate(`/appointments/${r.id}`)}
      emptyState={<EmptyState icon={Calendar} title={filtered ? 'No matching appointments' : 'No appointments yet'} description={filtered ? 'Change or clear the search and tag filters to see more appointments.' : 'Create an appointment using an existing patient and provider.'} />} />}
  </div>;
}
