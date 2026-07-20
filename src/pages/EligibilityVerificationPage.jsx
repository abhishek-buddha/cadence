import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import EmptyState from '../components/EmptyState';
import { eligibilityVerifications } from '../data/staticCaseData';

const COLUMNS = [
  { key: 'patientName', label: 'Patient Name' },
  { key: 'patientId', label: 'Patient ID', render: (r) => <span className="font-data">{r.patientId}</span> },
  { key: 'dos', label: 'DOS' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'status', label: 'Eligibility Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'priority', label: 'Priority', align: 'center', render: (r) => <PriorityBadge priority={r.priority} /> },
  { key: 'assignedTo', label: 'Assigned To' },
  { key: 'lastAttempt', label: 'Last Attempt' },
  { key: 'nextAttempt', label: 'Next Attempt' },
  { key: 'outcome', label: 'Outcome' },
];

export default function EligibilityVerificationPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Eligibility Verification</h1>
        <p className="text-sm text-muted mt-1">{eligibilityVerifications.length} record{eligibilityVerifications.length !== 1 ? 's' : ''}</p>
      </div>

      <ListTable
        columns={COLUMNS}
        rows={eligibilityVerifications}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/eligibility-verification/${r.id}`)}
        emptyState={
          <EmptyState
            icon={Activity}
            title="No eligibility verification records"
            description="Records will appear here once this module is connected."
          />
        }
      />
    </div>
  );
}
