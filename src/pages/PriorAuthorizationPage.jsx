import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import ListToolbar from '../components/ListToolbar';
import EmptyState from '../components/EmptyState';
import { priorAuthorizations } from '../data/staticCaseData';

function filterRows(rows, searchQuery) {
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter((row) =>
    Object.values(row).some((v) => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q))
  );
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const filteredRows = filterRows(priorAuthorizations, searchQuery);

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in">
      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery} />

      <ListTable
        columns={COLUMNS}
        rows={filteredRows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/prior-authorization/${r.id}`)}
        emptyState={
          <EmptyState
            icon={ClipboardCheck}
            title={searchQuery ? 'No matching records' : 'No prior authorization records'}
            description={searchQuery ? 'Try a different search term.' : 'Records will appear here once this module is connected.'}
          />
        }
      />
    </div>
  );
}
