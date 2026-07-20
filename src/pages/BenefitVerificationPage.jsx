import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import EmptyState from '../components/EmptyState';
import { benefitVerifications } from '../data/staticCaseData';

const COLUMNS = [
  { key: 'patientName', label: 'Patient Name' },
  { key: 'patientId', label: 'Patient ID', render: (r) => <span className="font-data">{r.patientId}</span> },
  { key: 'dos', label: 'DOS' },
  { key: 'insurance', label: 'Insurance / Payer' },
  { key: 'planType', label: 'Plan Type' },
  { key: 'status', label: 'Verification Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'priority', label: 'Priority', align: 'center', render: (r) => <PriorityBadge priority={r.priority} /> },
  { key: 'assignedTo', label: 'Assigned To' },
  { key: 'lastAttempt', label: 'Last Attempt' },
  { key: 'nextAttempt', label: 'Next Attempt' },
  { key: 'outcome', label: 'Outcome' },
];

export default function BenefitVerificationPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Benefit Verification</h1>
        <p className="text-sm text-muted mt-1">{benefitVerifications.length} record{benefitVerifications.length !== 1 ? 's' : ''}</p>
      </div>

      <ListTable
        columns={COLUMNS}
        rows={benefitVerifications}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/benefit-verification/${r.id}`)}
        emptyState={
          <EmptyState
            icon={ShieldCheck}
            title="No benefit verification records"
            description="Records will appear here once this module is connected."
          />
        }
      />
    </div>
  );
}
