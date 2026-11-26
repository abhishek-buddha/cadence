import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Calendar, Bell } from 'lucide-react';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import ListToolbar, { ListToolbarButton } from '../../components/ListToolbar';
import ListTable from '../../components/case/ListTable';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import AppointmentForm from './AppointmentForm';
import { listAppointments } from './api';
import { appointmentTime, callTime } from './format';

export default function AppointmentList() {
  const { data, loading, error, refetch } = useLiveQuery(listAppointments, [], 'appointment');
  const [search, setSearch] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') === 'reminder' ? 'reminder' : 'scheduling';
  useEffect(() => {
    const timer = setInterval(refetch, 5000);
    return () => clearInterval(timer);
  }, [refetch]);
  const filtered = search || bookingStatus || callStatus;
  const rows = (data || []).filter(r =>
    (!bookingStatus || r.status === bookingStatus) &&
    (!callStatus || (r.last_call_status || 'not_called') === callStatus) &&
    Object.values(r).some(v => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(search.toLowerCase())));
  const columns = [
    { key: 'patient_name', label: 'Patient Name', render: r => <Link to={`/appointments/${tab}/${r.id}`} className="text-accent font-medium hover:underline focus-visible:outline focus-visible:outline-accent">{r.patient_name}</Link> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'last_call_status', label: 'Call Status', render: r => <StatusBadge status={r.last_call_status || 'not_called'} /> },
    { key: 'scheduled_at', label: 'Appointment Date/Time', render: r => <span title={r.timezone}>{appointmentTime(r)}</span> },
    { key: 'provider_name', label: 'Provider' },
    { key: 'location', label: 'Location' },
    { key: 'appointment_type', label: 'Appointment Type' },
    ...(tab === 'scheduling' ? [{ key: 'patient_id', label: 'Patient ID' }] : []),
    { key: 'confirmed_at', label: 'Attendance', render: r => r.status === 'cancelled' ? 'Not applicable' : r.confirmed_at ? 'Confirmed' : 'Awaiting confirmation' },
    { key: 'call_attempts', label: 'Call Attempts', align: 'center' },
    { key: 'last_attempt', label: 'Last Attempt', render: r => <span title={r.timezone}>{callTime(r.last_attempt, r.timezone)}</span> },
    { key: 'assigned_agent_name', label: 'Assigned To' },
    { key: 'last_outcome', label: 'Call Outcome', render: r => r.last_outcome?.replaceAll('_', ' ') || (r.call_attempts ? 'No outcome recorded' : 'Not called') },
    { key: 'callback_requested_at', label: 'Follow-up', render: r => r.callback_requested_at ? <StatusBadge status="callback_needed" /> : '—' },
  ];
  return <div className="h-full flex flex-col space-y-4 animate-fade-in">
    <div className="shrink-0 flex items-center gap-1 bg-white border border-border rounded-xl px-2 shadow-sm overflow-x-auto" role="tablist" aria-label="Appointment views">
      {['scheduling', 'reminder'].map(t => {
        const Icon = t === 'scheduling' ? Calendar : Bell;
        return <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setParams({ tab: t }); setEditing(false); }} className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap ${tab === t ? 'text-accent' : 'text-gray-500 hover:text-gray-800'}`}>
          <Icon className="w-4 h-4" />{t === 'scheduling' ? 'Scheduling' : 'Reminder'}
          {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />}
        </button>;
      })}
    </div>
    <ListToolbar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search patients, providers, or status" filters={<div className="flex items-center gap-3 flex-wrap">
      <select aria-label="Booking status" value={bookingStatus} onChange={e => setBookingStatus(e.target.value)} className="rounded-full border border-border-light bg-white py-2 pl-3 pr-8 text-xs text-gray-700 focus:ring-accent">
        <option value="">All booking tags</option>
        <option value="scheduled">Scheduled</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option>
      </select>
      <select aria-label="Call status" value={callStatus} onChange={e => setCallStatus(e.target.value)} className="rounded-full border border-border-light bg-white py-2 pl-3 pr-8 text-xs text-gray-700 focus:ring-accent">
        <option value="">All call tags</option>
        <option value="not_called">Not Called</option><option value="no_answer">No Answer</option>
        <option value="initiating">Initiating</option><option value="in_progress">In Progress</option>
        <option value="completed">Completed</option><option value="failed">Failed</option>
      </select>
      {filtered && <button className="text-xs text-white underline underline-offset-4 rounded focus-visible:outline focus-visible:outline-white" onClick={() => { setSearch(''); setBookingStatus(''); setCallStatus(''); }}>Clear filters</button>}
    </div>}>
      {tab === 'scheduling' && <ListToolbarButton icon={Plus} label="Create appointment" onClick={() => setEditing(true)} disabled={editing} />}
    </ListToolbar>
    {editing && <AppointmentForm onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />}
    {loading && <p role="status">Loading appointments…</p>}
    {error && <div role="alert" className="text-danger">{error.message} <button className="underline" onClick={refetch}>Retry</button></div>}
    {!loading && !error && <ListTable columns={columns} rows={rows} getRowKey={r => r.id} onRowClick={r => navigate(`/appointments/${tab}/${r.id}`)}
      emptyState={<EmptyState icon={tab === 'scheduling' ? Calendar : Bell} title={filtered ? 'No matching appointments' : 'No appointments yet'} description={filtered ? 'Change or clear the search and tag filters to see more appointments.' : 'Create an appointment in Scheduling using an existing patient and provider.'} />} />}
  </div>;
}
