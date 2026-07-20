import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import EmptyState from '../components/EmptyState';
import { priorAuthorizations } from '../data/staticCaseData';

const COLUMNS = [
  { key: 'patientName', label: 'Patient Name' },
  { key: 'patientId', label: 'Patient ID', render: (r) => <span className="font-data">{r.patientId}</span> },
  { key: 'procedure', label: 'Service / Procedure' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'requestDate', label: 'Request Date' },
  { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'priority', label: 'Priority', align: 'center', render: (r) => <PriorityBadge priority={r.priority} /> },
  { key: 'assignedTo', label: 'Assigned To' },
  { key: 'lastAttempt', label: 'Last Attempt' },
  { key: 'nextAttempt', label: 'Next Attempt' },
  { key: 'authExpiration', label: 'Auth Expiration' },
  { key: 'outcome', label: 'Outcome' },
];

export default function PriorAuthorizationPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Prior Authorization</h1>
        <p className="text-sm text-muted mt-1">{priorAuthorizations.length} record{priorAuthorizations.length !== 1 ? 's' : ''}</p>
      </div>

      <ListTable
        columns={COLUMNS}
        rows={priorAuthorizations}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/prior-authorization/${r.id}`)}
        emptyState={
          <EmptyState
            icon={ClipboardCheck}
            title="No prior authorization records"
            description="Records will appear here once this module is connected."
          />
        }
      />
    </div>
  );
}
