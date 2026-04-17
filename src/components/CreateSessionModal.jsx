import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
} from 'lucide-react';
import Modal from './Modal';

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

const USE_CASE_OPTIONS = [
  { value: 'claim_followup', label: 'Claim Follow-up', description: 'Status check on submitted claims' },
  { value: 'dental_ev', label: 'Dental Eligibility Verification', description: 'Benefit verification for dental services' },
];

function StepIndicator({ step }) {
  const steps = ['Payer', 'Items', 'Confirm'];
  return (
    <div className="flex items-center justify-center gap-2 mb-2">
      {steps.map((label, i) => {
        const idx = i + 1;
        const active = step === idx;
        const done = step > idx;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-data font-medium ${
                done
                  ? 'bg-success/15 text-success'
                  : active
                    ? 'bg-accent text-white'
                    : 'bg-surface text-muted'
              }`}
            >
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx}
            </div>
            <span className={`text-xs font-medium ${active ? 'text-gray-900' : 'text-muted'}`}>
              {label}
            </span>
            {idx < steps.length && <ChevronRight className="w-3.5 h-3.5 text-muted/40" />}
          </div>
        );
      })}
    </div>
  );
}

export default function CreateSessionModal({ open, onClose }) {
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const claims = useQuery(api.claims.list);
  const dentalCases = useQuery(api.dentalCases?.list);
  const patients = useQuery(api.patients.list);
  const createSession = useMutation(api.callSessions?.create);

  const [step, setStep] = useState(1);
  const [useCase, setUseCase] = useState('claim_followup');
  const [payerId, setPayerId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  function reset() {
    setStep(1);
    setUseCase('claim_followup');
    setPayerId('');
    setSelectedItemIds([]);
    setSearchQuery('');
    setError(null);
    setDone(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Build patient lookup
  const patientMap = useMemo(() => {
    const map = {};
    (patients ?? []).forEach((p) => { map[p._id] = `${p.firstName} ${p.lastName}`; });
    return map;
  }, [patients]);

  // Filter items by selected payer + use case
  const candidateItems = useMemo(() => {
    if (!payerId) return [];
    const source = useCase === 'dental_ev' ? dentalCases : claims;
    if (!source) return [];
    return source.filter((item) => item.insuranceContactId === payerId);
  }, [useCase, payerId, claims, dentalCases]);

  const filteredItems = candidateItems.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const patientName = patientMap[item.patientId] || '';
    const ref = item.claimNumber || item.caseNumber || '';
    return patientName.toLowerCase().includes(q) || ref.toLowerCase().includes(q);
  });

  function toggleItem(id) {
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  async function handleCreate() {
    if (!createSession) {
      setError('Sessions module not yet available.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSession({
        useCase,
        insuranceContactId: payerId,
        itemIds: selectedItemIds,
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Failed to create session.');
    } finally {
      setSaving(false);
    }
  }

  function canAdvanceStep1() { return !!payerId && !!useCase; }
  function canAdvanceStep2() { return selectedItemIds.length >= 1 && selectedItemIds.length <= 5; }

  if (done) {
    return (
      <Modal open={open} onClose={handleClose} title="Session Created">
        <div className="py-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
          <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">Session Created</h3>
          <p className="text-sm text-muted mb-6">
            Cadence will work through {selectedItemIds.length} item{selectedItemIds.length !== 1 ? 's' : ''} in this session.
          </p>
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

  const selectedPayer = (insuranceContacts ?? []).find((c) => c._id === payerId);

  return (
    <Modal open={open} onClose={handleClose} title="New Multi-Patient Session" wide>
      <div className="space-y-5">
        <StepIndicator step={step} />

        {/* STEP 1: Pick payer + use case */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className={LABEL_CLASS}>Use Case</label>
              <div className="grid grid-cols-2 gap-3">
                {USE_CASE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setUseCase(opt.value); setSelectedItemIds([]); }}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      useCase === opt.value
                        ? 'bg-accent/5 border-accent text-accent'
                        : 'bg-white border-border hover:border-accent/40 text-gray-700'
                    }`}
                  >
                    <p className="text-sm font-medium mb-1">{opt.label}</p>
                    <p className="text-xs text-muted">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Insurance Payer</label>
              <select
                value={payerId}
                onChange={(e) => { setPayerId(e.target.value); setSelectedItemIds([]); }}
                className={`${INPUT_CLASS} custom-select pr-8 cursor-pointer`}
              >
                <option value="">Select a payer...</option>
                {(insuranceContacts ?? []).map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted mt-2">
                A session calls a single payer for multiple patients in one phone call.
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: Pick items */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                <Building2 className="w-3.5 h-3.5 inline mr-1.5 text-accent" />
                {selectedPayer?.name}
              </p>
              <span className="text-xs text-muted">
                <span className="font-data text-gray-900">{selectedItemIds.length}</span> / 5 selected
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Search patient name or ref #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${INPUT_CLASS} pl-9`}
              />
            </div>

            <div className="border border-border rounded-lg max-h-80 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">
                  {candidateItems.length === 0
                    ? `No ${useCase === 'dental_ev' ? 'cases' : 'claims'} found for this payer.`
                    : 'No matches for your search.'}
                </p>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedItemIds.includes(item._id);
                  const atLimit = !isSelected && selectedItemIds.length >= 5;
                  const ref = item.claimNumber || item.caseNumber || item._id?.slice(-6).toUpperCase();
                  return (
                    <button
                      key={item._id}
                      type="button"
                      disabled={atLimit}
                      onClick={() => toggleItem(item._id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/40 last:border-b-0 ${
                        isSelected
                          ? 'bg-accent/5'
                          : atLimit
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-4 h-4 rounded border-border-light text-accent focus:ring-accent"
                      />
                      <span className="font-data text-accent text-sm shrink-0">{ref}</span>
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {patientMap[item.patientId] || 'Unknown patient'}
                      </span>
                      {item.cdtCodes && (
                        <span className="text-xs text-muted font-data">
                          {item.cdtCodes.slice(0, 3).join(', ')}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-accent/5 border border-accent/15 rounded-lg p-4">
              <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">Session Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Use Case</span>
                  <span className="text-gray-900 font-medium">
                    {USE_CASE_OPTIONS.find((o) => o.value === useCase)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Payer</span>
                  <span className="text-gray-900 font-medium">{selectedPayer?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Items</span>
                  <span className="text-gray-900 font-medium font-data">{selectedItemIds.length}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">Items in Session</p>
              <div className="space-y-2 max-h-56 overflow-y-auto border border-border rounded-lg p-2">
                {selectedItemIds.map((id, idx) => {
                  const item = candidateItems.find((c) => c._id === id);
                  if (!item) return null;
                  const ref = item.claimNumber || item.caseNumber || id.slice(-6).toUpperCase();
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-gray-50"
                    >
                      <span className="w-5 h-5 rounded-full bg-surface text-xs font-data text-muted flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-data text-accent text-sm shrink-0">{ref}</span>
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {patientMap[item.patientId] || 'Unknown patient'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleItem(id)}
                        className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canAdvanceStep1()) || (step === 2 && !canAdvanceStep2())}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Users className="w-4 h-4" />
              {saving ? 'Creating...' : 'Create Session'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
