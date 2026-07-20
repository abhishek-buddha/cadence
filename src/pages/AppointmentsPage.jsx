import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Bell } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import EmptyState from '../components/EmptyState';
import { appointmentScheduling, appointmentReminders } from '../data/staticCaseData';

const TABS = [
  { key: 'scheduling', label: 'Scheduling' },
  { key: 'reminder', label: 'Reminder' },
];

const SCHEDULING_COLUMNS = [
  { key: 'patientName', label: 'Patient Name' },
  { key: 'mrn', label: 'Patient ID / MRN' },
  { key: 'provider', label: 'Provider' },
  { key: 'location', label: 'Location' },
  { key: 'apptType', label: 'Appointment Type' },
  { key: 'requestedWindow', label: 'Requested Date/Time Window' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'priority', label: 'Priority', align: 'center', render: (r) => <PriorityBadge priority={r.priority} /> },
  { key: 'assignedTo', label: 'Assigned To' },
  { key: 'lastAttempt', label: 'Last Attempt' },
  { key: 'nextAttempt', label: 'Next Attempt' },
  { key: 'outcome', label: 'Outcome' },
];

const REMINDER_COLUMNS = [
  { key: 'patientName', label: 'Patient Name' },
  { key: 'apptDateTime', label: 'Appointment Date/Time', render: (r) => `${r.apptDate} ${r.apptTime}` },
  { key: 'provider', label: 'Provider' },
  { key: 'location', label: 'Location' },
  { key: 'apptType', label: 'Appointment Type' },
  { key: 'reminderStatus', label: 'Reminder Status', align: 'center', render: (r) => <StatusBadge status={r.reminderStatus} /> },
  { key: 'callAttempts', label: 'Call Attempts', align: 'center' },
  { key: 'lastAttempt', label: 'Last Attempt' },
  { key: 'nextAttempt', label: 'Next Attempt' },
  { key: 'assignedTo', label: 'Assigned To' },
];

export default function AppointmentsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('scheduling');

  const rows = tab === 'scheduling' ? appointmentScheduling : appointmentReminders;
  const columns = tab === 'scheduling' ? SCHEDULING_COLUMNS : REMINDER_COLUMNS;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Appointments</h1>
        <p className="text-sm text-muted mt-1">{rows.length} record{rows.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-border rounded-xl px-2 shadow-sm overflow-x-auto">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          const Icon = t.key === 'scheduling' ? Calendar : Bell;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'text-accent' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />}
            </button>
          );
        })}
      </div>

      <ListTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/appointments/${tab}/${r.id}`)}
        emptyState={
          <EmptyState
            icon={tab === 'scheduling' ? Calendar : Bell}
            title={`No ${tab === 'scheduling' ? 'scheduling' : 'reminder'} records`}
            description="Records will appear here once this module is connected."
          />
        }
      />
    </div>
  );
}
