import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  Search,
} from 'lucide-react';
import Modal from './Modal';

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

const COMMON_CDT_CODES = [
  'D0150', 'D1110', 'D2330', 'D2740', 'D3310', 'D4341', 'D7210',
];

// ---------------------------------------------------------------------------
// Combobox component
// ---------------------------------------------------------------------------
function Combobox({ value, onChange, options, placeholder, getLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = (options || []).filter((opt) => {
    if (!query) return true;
    const label = getLabel(opt).toLowerCase();
    return label.includes(query.toLowerCase());
  });

  const selected = (options || []).find((opt) => opt._id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${INPUT_CLASS} flex items-center justify-between text-left`}
      >
        <span className={selected ? 'text-gray-900' : 'text-muted'}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-border-light rounded-lg shadow-xl shadow-gray-200/60 py-1 max-h-64 overflow-y-auto animate-fade-in">
          <div className="px-2 pb-2 border-b border-border sticky top-0 bg-white">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-border-light rounded outline-none focus:border-accent"
                autoFocus
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs text-muted text-center px-3 py-4">No matches</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt._id}
                type="button"
                onClick={() => {
                  onChange(opt._id);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
                  opt._id === value
                    ? 'bg-accent/5 text-accent font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {getLabel(opt)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CDT code chip entry
// ---------------------------------------------------------------------------
function CdtChipInput({ value, onChange }) {
  const [input, setInput] = useState('');

  function addCode(code) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (value.includes(c)) return;
    onChange([...value, c]);
    setInput('');
  }

  function removeCode(code) {
    onChange(value.filter((v) => v !== code));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-xs rounded font-data"
          >
            {code}
            <button
              type="button"
              onClick={() => removeCode(code)}
              className="hover:text-accent-hover"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addCode(input);
          } else if (e.key === 'Backspace' && !input && value.length > 0) {
            removeCode(value[value.length - 1]);
          }
        }}
        placeholder="Type CDT code and press Enter (e.g. D0150)"
        className={INPUT_CLASS}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="text-[10px] text-muted uppercase tracking-wider">Common:</span>
        {COMMON_CDT_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => addCode(code)}
            disabled={value.includes(code)}
            className="text-[11px] font-data text-accent hover:bg-accent/5 border border-accent/20 rounded px-1.5 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// MAIN MODAL
// ===========================================================================
export default function AddDentalCaseModal({ open, onClose }) {
  const patients = useQuery(api.patients.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const providers = useQuery(api.providers.list);
  const plans = useQuery(api.dentalPlans?.list);
  const createCase = useMutation(api.dentalCases?.create);

  const [patientId, setPatientId] = useState('');
  const [planId, setPlanId] = useState('');
  const [insuranceContactId, setInsuranceContactId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [dateOfService, setDateOfService] = useState('');
  const [cdtCodes, setCdtCodes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  function reset() {
    setPatientId('');
    setPlanId('');
    setInsuranceContactId('');
    setProviderId('');
    setDateOfService('');
    setCdtCodes([]);
    setError(null);
    setDone(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!patientId || !insuranceContactId || !providerId || cdtCodes.length === 0) {
      setError('Patient, payer, provider, and at least one CDT code are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!createCase) {
        throw new Error('Dental case module not yet available. Deploy Convex to enable.');
      }
      await createCase({
        patientId,
        planId: planId || undefined,
        insuranceContactId,
        providerId,
        proposedDateOfService: dateOfService || undefined,
        cdtCodes,
        status: 'awaiting_verification',
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Failed to create case.');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Modal open={open} onClose={handleClose} title="Dental Case Created">
        <div className="py-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
          <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">Case Created</h3>
          <p className="text-sm text-muted mb-6">The dental EV case is ready for verification.</p>
          <button
            onClick={handleClose}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Dental EV Case" wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-accent">Dental Eligibility Verification:</strong> Enter patient,
            plan, payer, and proposed CDT codes. Cadence will call the payer to verify coverage.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Patient *</label>
            <Combobox
              value={patientId}
              onChange={setPatientId}
              options={patients}
              placeholder="Select patient..."
              getLabel={(p) => `${p.firstName} ${p.lastName}`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Dental Plan</label>
            <Combobox
              value={planId}
              onChange={setPlanId}
              options={plans}
              placeholder="Select plan..."
              getLabel={(p) => p.name || p.planCode || 'Plan'}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Insurance Payer *</label>
            <Combobox
              value={insuranceContactId}
              onChange={setInsuranceContactId}
              options={insuranceContacts}
              placeholder="Select payer..."
              getLabel={(c) => c.name}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Provider *</label>
            <Combobox
              value={providerId}
              onChange={setProviderId}
              options={providers}
              placeholder="Select provider..."
              getLabel={(p) => p.practiceName}
            />
          </div>

          <div className="col-span-2">
            <label className={LABEL_CLASS}>Proposed Date of Service</label>
            <input
              type="date"
              value={dateOfService}
              onChange={(e) => setDateOfService(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="col-span-2">
            <label className={LABEL_CLASS}>CDT Codes *</label>
            <CdtChipInput value={cdtCodes} onChange={setCdtCodes} />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-muted bg-surface border border-border rounded-lg opacity-50 cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            AI Autofill
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {saving ? 'Creating...' : 'Create Case'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
