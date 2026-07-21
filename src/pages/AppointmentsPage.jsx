import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Bell } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import ListToolbar from '../components/ListToolbar';
import EmptyState from '../components/EmptyState';
import { appointmentScheduling, appointmentReminders } from '../data/staticCaseData';

function filterRows(rows, searchQuery) {
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter((row) =>
    Object.values(row).some((v) => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q))
  );
}

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
  const [searchQuery, setSearchQuery] = useState('');

  const rows = tab === 'scheduling' ? appointmentScheduling : appointmentReminders;
  const columns = tab === 'scheduling' ? SCHEDULING_COLUMNS : REMINDER_COLUMNS;
  const filteredRows = filterRows(rows, searchQuery);

  return (
    <div className="space-y-6 animate-fade-in">
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

      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery} />

      <ListTable
        columns={columns}
        rows={filteredRows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/appointments/${tab}/${r.id}`)}
        emptyState={
          <EmptyState
            icon={tab === 'scheduling' ? Calendar : Bell}
            title={searchQuery ? 'No matching records' : `No ${tab === 'scheduling' ? 'scheduling' : 'reminder'} records`}
            description={searchQuery ? 'Try a different search term.' : 'Records will appear here once this module is connected.'}
          />
        }
      />
    </div>
  );
}
