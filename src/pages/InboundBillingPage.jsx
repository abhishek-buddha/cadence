import { useNavigate } from 'react-router-dom';
import { PhoneIncoming } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import ListTable from '../components/case/ListTable';
import EmptyState from '../components/EmptyState';
import { inboundBillingCases } from '../data/staticCaseData';

const COLUMNS = [
  { key: 'callId', label: 'Call ID', render: (r) => <span className="font-data text-accent">{r.callId}</span> },
  { key: 'callerName', label: 'Patient Name' },
  { key: 'phone', label: 'Phone Number', render: (r) => <span className="font-data">{r.phone}</span> },
  { key: 'callDateTime', label: 'Call Date/Time' },
  { key: 'reason', label: 'Call Reason' },
  { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'assignedTo', label: 'Assigned To' },
  { key: 'duration', label: 'Duration', align: 'right', render: (r) => <span className="font-data">{r.duration}</span> },
  { key: 'outcome', label: 'Outcome' },
];

export default function InboundBillingPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Inbound Billing</h1>
        <p className="text-sm text-muted mt-1">{inboundBillingCases.length} call{inboundBillingCases.length !== 1 ? 's' : ''}</p>
      </div>

      <ListTable
        columns={COLUMNS}
        rows={inboundBillingCases}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/inbound-billing/${r.id}`)}
        emptyState={
          <EmptyState
            icon={PhoneIncoming}
            title="No inbound billing calls"
            description="Calls will appear here once this module is connected."
          />
        }
      />
    </div>
  );
}
