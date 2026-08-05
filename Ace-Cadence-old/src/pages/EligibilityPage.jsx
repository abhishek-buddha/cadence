import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Upload,
  Search,
  ChevronDown,
  Sparkles,
  Smile,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import AddDentalCaseModal from '../components/AddDentalCaseModal';
import BulkImportEvCasesModal from '../components/BulkImportEvCasesModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'awaiting_verification', label: 'Awaiting Verification' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'verified', label: 'Verified' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
  { value: 'transferred_to_human', label: 'Transferred' },
];

const INPUT_CLASS =
  'bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none w-full';
const SELECT_CLASS =
  'bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-700 focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer';

function FilterSelect({ value, onChange, options, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${SELECT_CLASS} pr-8 w-full`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
    </div>
  );
}

function ShimmerRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="shimmer rounded h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '---';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EligibilityPage() {
  const navigate = useNavigate();
  const cases = useQuery(api.dentalCases?.list);
  const patients = useQuery(api.patients.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const plans = useQuery(api.dentalPlans?.list);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [payerFilter, setPayerFilter] = useState('');
  const [dosFrom, setDosFrom] = useState('');
  const [dosTo, setDosTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = cases === undefined;

  const patientMap = {};
  (patients ?? []).forEach((p) => { patientMap[p._id] = `${p.firstName} ${p.lastName}`; });
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });
  const planMap = {};
  (plans ?? []).forEach((p) => { planMap[p._id] = p.name || p.planCode; });

  const payerOptions = [
    { value: '', label: 'All Payers' },
    ...(insuranceContacts ?? []).map((c) => ({ value: c._id, label: c.name })),
  ];

  const filtered = (cases ?? []).filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (payerFilter && c.insuranceContactId !== payerFilter) return false;
    if (dosFrom && (!c.proposedDateOfService || c.proposedDateOfService < dosFrom)) return false;
    if (dosTo && (!c.proposedDateOfService || c.proposedDateOfService > dosTo)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const patientName = patientMap[c.patientId] || '';
      const caseNum = c.caseNumber || '';
      if (!patientName.toLowerCase().includes(q) && !caseNum.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-border-light hover:border-accent hover:text-accent text-gray-700 text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Import Cases
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Add Case
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-border rounded-xl p-4 shadow-sm">
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} className="w-48" />
        <FilterSelect value={payerFilter} onChange={setPayerFilter} options={payerOptions} className="w-48" />
        <input
          type="date"
          value={dosFrom}
          onChange={(e) => setDosFrom(e.target.value)}
          className={`${INPUT_CLASS} w-40`}
          placeholder="From"
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          value={dosTo}
          onChange={(e) => setDosTo(e.target.value)}
          className={`${INPUT_CLASS} w-40`}
          placeholder="To"
        />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search case # or patient name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${INPUT_CLASS} pl-9`}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Case #</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Patient</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Payer</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Plan</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold">CDT Codes</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">DOS</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <ShimmerRow key={i} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={Smile}
                    title="No dental EV cases found"
                    description={
                      statusFilter || payerFilter || dosFrom || dosTo || searchQuery
                        ? 'Try adjusting your filters.'
                        : 'Add a new case or import from spreadsheet.'
                    }
                    action={
                      !statusFilter && !payerFilter && !dosFrom && !dosTo && !searchQuery ? (
                        <button
                          onClick={() => setAddModalOpen(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          Add Case
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c._id}
                  onClick={() => navigate(`/eligibility/${c._id}`)}
                  className="table-row-hover cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3.5 font-data text-accent whitespace-nowrap">{c.caseNumber || c._id?.slice(-6).toUpperCase()}</td>
                  <td className="px-4 py-3.5 text-gray-900 whitespace-nowrap">{patientMap[c.patientId] || '---'}</td>
                  <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{insuranceMap[c.insuranceContactId] || '---'}</td>
                  <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{planMap[c.planId] || '---'}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {(c.cdtCodes || []).slice(0, 4).map((code) => (
                        <span key={code} className="inline-flex px-1.5 py-0.5 bg-accent/10 text-accent text-xs rounded font-data">
                          {code}
                        </span>
                      ))}
                      {(c.cdtCodes || []).length > 4 && (
                        <span className="text-xs text-muted font-data">+{c.cdtCodes.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap font-data">
                    {formatDate(c.proposedDateOfService)}
                  </td>
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <StatusBadge status={c.status || 'unknown'} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddDentalCaseModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
      <BulkImportEvCasesModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  );
}
