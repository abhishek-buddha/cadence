import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Plus,
  Search,
  FileText,
  ChevronDown,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'paid', label: 'Paid' },
  { value: 'denied', label: 'Denied' },
  { value: 'appealing', label: 'Appealing' },
  { value: 'write_off', label: 'Write Off' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const AGING_BUCKET_OPTIONS = [
  { value: '', label: 'All Ages' },
  { value: '0-30', label: '0-30 days' },
  { value: '31-60', label: '31-60 days' },
  { value: '61-90', label: '61-90 days' },
  { value: '91-120', label: '91-120 days' },
  { value: '120+', label: '120+ days' },
];

const PRIORITY_DOT_COLORS = {
  high: 'bg-danger',
  medium: 'bg-warn',
  low: 'bg-success',
};

const INPUT_CLASS =
  'bg-surface border border-border-light rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none w-full';

const LABEL_CLASS = 'text-xs uppercase tracking-wider text-muted font-medium mb-1.5 block';

const SELECT_CLASS =
  'bg-surface border border-border-light rounded-lg px-3 py-2 text-sm text-white focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer';

function formatCurrency(cents) {
  if (cents == null) return '$0.00';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(dateStr) {
  if (!dateStr) return '---';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ShimmerRow() {
  return (
    <tr>
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="shimmer rounded h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

function FilterSelect({ value, onChange, options, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${SELECT_CLASS} pr-8 w-full`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
    </div>
  );
}

const INITIAL_FORM = {
  claimNumber: '',
  patientId: '',
  insuranceContactId: '',
  providerId: '',
  amount: '',
  dateOfService: '',
  status: 'pending',
  priority: 'medium',
  agingBucket: '0-30',
  cptCodes: '',
  notes: '',
};

export default function ClaimsPage() {
  const navigate = useNavigate();
  const claims = useQuery(api.claims.list);
  const patients = useQuery(api.patients.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const providers = useQuery(api.providers.list);
  const createClaim = useMutation(api.claims.create);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [agingFilter, setAgingFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = claims === undefined;

  // Apply filters
  const filteredClaims = (claims ?? []).filter((claim) => {
    if (statusFilter && claim.status !== statusFilter) return false;
    if (priorityFilter && claim.priority !== priorityFilter) return false;
    if (agingFilter && claim.agingBucket !== agingFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesClaimNum = claim.claimNumber?.toLowerCase().includes(q);
      const matchesPatient = claim.patientName?.toLowerCase().includes(q);
      const matchesInsurance = claim.insuranceName?.toLowerCase().includes(q);
      if (!matchesClaimNum && !matchesPatient && !matchesInsurance) return false;
    }
    return true;
  });

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const amountCents = Math.round(parseFloat(form.amount || '0') * 100);
      const cptCodes = form.cptCodes
        ? form.cptCodes.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await createClaim({
        claimNumber: form.claimNumber,
        patientId: form.patientId || undefined,
        insuranceContactId: form.insuranceContactId || undefined,
        providerId: form.providerId || undefined,
        amount: amountCents,
        dateOfService: form.dateOfService || undefined,
        status: form.status,
        priority: form.priority,
        agingBucket: form.agingBucket,
        cptCodes,
        notes: form.notes || undefined,
      });

      setForm(INITIAL_FORM);
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to create claim:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Claims</h1>
          <p className="text-sm text-muted mt-1">
            {!isLoading && `${filteredClaims.length} claim${filteredClaims.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Claim
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-panel border border-border rounded-xl p-4">
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          className="w-40"
        />
        <FilterSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={PRIORITY_OPTIONS}
          className="w-36"
        />
        <FilterSelect
          value={agingFilter}
          onChange={setAgingFilter}
          options={AGING_BUCKET_OPTIONS}
          className="w-36"
        />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search claims, patients, insurance..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${INPUT_CLASS} pl-9`}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel sticky top-0 z-10">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Claim #
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Patient
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Insurance
                </th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Amount
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  DOS
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Status
                </th>
                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Priority
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Age
                </th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <ShimmerRow key={i} />)
              ) : filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={FileText}
                      title="No claims found"
                      description={
                        statusFilter || priorityFilter || agingFilter || searchQuery
                          ? 'Try adjusting your filters to find what you are looking for.'
                          : 'Create your first claim to get started.'
                      }
                      action={
                        !statusFilter && !priorityFilter && !agingFilter && !searchQuery ? (
                          <button
                            onClick={() => setModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            New Claim
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredClaims.map((claim) => (
                  <tr
                    key={claim._id}
                    onClick={() => navigate(`/claims/${claim._id}`)}
                    className="table-row-hover cursor-pointer"
                  >
                    <td className="px-4 py-3 font-data text-accent whitespace-nowrap">
                      {claim.claimNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {claim.patientName ?? '---'}
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {claim.insuranceName ?? '---'}
                    </td>
                    <td className="px-4 py-3 font-data text-white text-right whitespace-nowrap">
                      {formatCurrency(claim.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {formatDate(claim.dateOfService)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={claim.status ?? 'unknown'} />
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            PRIORITY_DOT_COLORS[claim.priority] ?? 'bg-gray-500'
                          }`}
                        />
                        <span className="text-gray-300 capitalize text-xs">
                          {claim.priority ?? '---'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-data text-xs">
                      {claim.agingBucket ?? '---'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/claims/${claim._id}`);
                        }}
                        className="text-xs text-accent hover:text-accent-hover font-medium transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Claim Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Claim" wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Row 1: Claim Number + Date of Service */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Claim Number</label>
              <input
                type="text"
                placeholder="CLM-00001"
                value={form.claimNumber}
                onChange={(e) => updateForm('claimNumber', e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Date of Service</label>
              <input
                type="date"
                value={form.dateOfService}
                onChange={(e) => updateForm('dateOfService', e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Row 2: Patient + Insurance Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Patient</label>
              <div className="relative">
                <select
                  value={form.patientId}
                  onChange={(e) => updateForm('patientId', e.target.value)}
                  className={`${INPUT_CLASS} appearance-none pr-8`}
                >
                  <option value="">Select patient...</option>
                  {(patients ?? []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Insurance Contact</label>
              <div className="relative">
                <select
                  value={form.insuranceContactId}
                  onChange={(e) => updateForm('insuranceContactId', e.target.value)}
                  className={`${INPUT_CLASS} appearance-none pr-8`}
                >
                  <option value="">Select insurance...</option>
                  {(insuranceContacts ?? []).map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.company ?? c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 3: Provider + Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Provider</label>
              <div className="relative">
                <select
                  value={form.providerId}
                  onChange={(e) => updateForm('providerId', e.target.value)}
                  className={`${INPUT_CLASS} appearance-none pr-8`}
                >
                  <option value="">Select provider...</option>
                  {(providers ?? []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => updateForm('amount', e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Row 4: Status + Priority + Aging Bucket */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASS}>Status</label>
              <div className="relative">
                <select
                  value={form.status}
                  onChange={(e) => updateForm('status', e.target.value)}
                  className={`${INPUT_CLASS} appearance-none pr-8`}
                >
                  {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Priority</label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={(e) => updateForm('priority', e.target.value)}
                  className={`${INPUT_CLASS} appearance-none pr-8`}
                >
                  {PRIORITY_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Aging Bucket</label>
              <div className="relative">
                <select
                  value={form.agingBucket}
                  onChange={(e) => updateForm('agingBucket', e.target.value)}
                  className={`${INPUT_CLASS} appearance-none pr-8`}
                >
                  {AGING_BUCKET_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
          </div>

          {/* CPT Codes */}
          <div>
            <label className={LABEL_CLASS}>CPT Codes</label>
            <input
              type="text"
              placeholder="99213, 99214, 99215"
              value={form.cptCodes}
              onChange={(e) => updateForm('cptCodes', e.target.value)}
              className={INPUT_CLASS}
            />
            <p className="text-xs text-muted/60 mt-1">Comma-separated CPT codes</p>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL_CLASS}>Notes</label>
            <textarea
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => updateForm('notes', e.target.value)}
              rows={3}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !form.claimNumber}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Claim'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
