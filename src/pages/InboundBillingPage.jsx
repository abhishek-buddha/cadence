import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneIncoming } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import ListTable from '../components/case/ListTable';
import ListToolbar from '../components/ListToolbar';
import EmptyState from '../components/EmptyState';
import { inboundBillingCases } from '../data/staticCaseData';

function filterRows(rows, searchQuery) {
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter((row) =>
    Object.values(row).some((v) => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q))
  );
}

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
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRows = filterRows(inboundBillingCases, searchQuery);

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in">
      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery} />

      <ListTable
        columns={COLUMNS}
        rows={filteredRows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/inbound-billing/${r.id}`)}
        emptyState={
          <EmptyState
            icon={PhoneIncoming}
            title={searchQuery ? 'No matching records' : 'No inbound billing calls'}
            description={searchQuery ? 'Try a different search term.' : 'Calls will appear here once this module is connected.'}
          />
        }
      />
    </div>
  );
}
