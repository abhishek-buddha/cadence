import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/case/PriorityBadge';
import ListTable from '../components/case/ListTable';
import ListToolbar from '../components/ListToolbar';
import EmptyState from '../components/EmptyState';
import { benefitVerifications } from '../data/staticCaseData';

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
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRows = filterRows(benefitVerifications, searchQuery);

  return (
    <div className="space-y-6 animate-fade-in">
      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery} />

      <ListTable
        columns={COLUMNS}
        rows={filteredRows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/benefit-verification/${r.id}`)}
        emptyState={
          <EmptyState
            icon={ShieldCheck}
            title={searchQuery ? 'No matching records' : 'No benefit verification records'}
            description={searchQuery ? 'Try a different search term.' : 'Records will appear here once this module is connected.'}
          />
        }
      />
    </div>
  );
}
