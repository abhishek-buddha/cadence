import { useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  X,
} from 'lucide-react';
import Modal from './Modal';

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';

const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

function formatCurrency(cents) {
  if (cents == null) return '$0.00';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function AddClaimModal({ open, onClose }) {
  const aiAutofill = useAction(api.claimImport.aiAutofillClaim);
  const bulkImportClaims = useMutation(api.claimImport.bulkImportClaims);

  // Stage: input → loading → review → saving → done
  const [stage, setStage] = useState('input');
  const [error, setError] = useState(null);

  // Input fields
  const [claimNumber, setClaimNumber] = useState('');
  const [patientName, setPatientName] = useState('');
  const [insuranceName, setInsuranceName] = useState('');
  const [dateOfService, setDateOfService] = useState('');
  const [amount, setAmount] = useState('');
  const [cptCodes, setCptCodes] = useState('');
  const [diagnosisCodes, setDiagnosisCodes] = useState('');
  const [notes, setNotes] = useState('');

  // AI result
  const [aiResult, setAiResult] = useState(null);

  // Editable review fields
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Import result
  const [importResult, setImportResult] = useState(null);

  function reset() {
    setStage('input');
    setError(null);
    setClaimNumber('');
    setPatientName('');
    setInsuranceName('');
    setDateOfService('');
    setAmount('');
    setCptCodes('');
    setDiagnosisCodes('');
    setNotes('');
    setAiResult(null);
    setEditingField(null);
    setEditValue('');
    setImportResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const hasInput = claimNumber || patientName || insuranceName || dateOfService || amount || cptCodes || diagnosisCodes || notes;

  async function handleAiAutofill() {
    if (!hasInput) return;
    setStage('loading');
    setError(null);

    try {
      const result = await aiAutofill({
        claimNumber: claimNumber || undefined,
        patientName: patientName || undefined,
        insuranceName: insuranceName || undefined,
        amount: amount || undefined,
        dateOfService: dateOfService || undefined,
        cptCodes: cptCodes || undefined,
        diagnosisCodes: diagnosisCodes || undefined,
        notes: notes || undefined,
      });
      setAiResult(result);
      setStage('review');
    } catch (err) {
      setError(err.message || 'AI processing failed');
      setStage('input');
    }
  }

  function startEdit(field, currentValue) {
    setEditingField(field);
    setEditValue(
      Array.isArray(currentValue) ? currentValue.join(', ') :
      currentValue == null ? '' :
      String(currentValue)
    );
  }

  function saveEdit(field) {
    if (!aiResult) return;
    const updated = { ...aiResult };

    if (field === 'cptCodes' || field === 'diagnosisCodes') {
      updated[field] = editValue ? editValue.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else if (field === 'amount') {
      const cleaned = editValue.replace(/[$,]/g, '');
      const parsed = parseFloat(cleaned);
      updated[field] = isNaN(parsed) ? 0 : Math.round(parsed * 100);
    } else {
      updated[field] = editValue || null;
    }

    setAiResult(updated);
    setEditingField(null);
    setEditValue('');
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue('');
  }

  async function handleCreateClaim() {
    if (!aiResult) return;
    setStage('saving');
    setError(null);

    try {
      const result = await bulkImportClaims({
        claims: [
          {
            claimNumber: aiResult.claimNumber || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            patientFirstName: aiResult.patientFirstName || 'Unknown',
            patientLastName: aiResult.patientLastName || 'Patient',
            patientDOB: aiResult.patientDOB || '1900-01-01',
            memberId: aiResult.memberId || `MBR-${Date.now()}`,
            groupNumber: aiResult.groupNumber || undefined,
            insuranceName: aiResult.insuranceName || 'Unknown Insurance',
            matchedPatientId: aiResult.matchedPatientId || undefined,
            matchedInsuranceId: aiResult.matchedInsuranceId || undefined,
            matchedProviderId: aiResult.matchedProviderId || undefined,
            amount: typeof aiResult.amount === 'number' ? aiResult.amount : 0,
            dateOfService: aiResult.dateOfService || new Date().toISOString().split('T')[0],
            dateSubmitted: aiResult.dateSubmitted || undefined,
            cptCodes: aiResult.cptCodes || undefined,
            diagnosisCodes: aiResult.diagnosisCodes || undefined,
            status: aiResult.status || 'pending',
            priority: aiResult.priority || 'medium',
            agingBucket: aiResult.agingBucket || '0-30',
            notes: aiResult.notes || undefined,
          },
        ],
      });
      setImportResult(result);
      setStage('done');
    } catch (err) {
      setError(err.message || 'Failed to create claim');
      setStage('review');
    }
  }

  // Editable field row for review stage
  function ReviewField({ label, field, value, isMatched }) {
    const displayValue =
      Array.isArray(value) ? value.join(', ') :
      field === 'amount' ? formatCurrency(value) :
      value || '---';

    const isEditing = editingField === field;

    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-b-0">
        <span className="text-xs uppercase tracking-wider text-muted font-medium w-32 shrink-0">{label}</span>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(field);
                  if (e.key === 'Escape') cancelEdit();
                }}
                className={INPUT_CLASS}
                autoFocus
              />
              <button
                onClick={() => saveEdit(field)}
                className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <button
                onClick={cancelEdit}
                className="p-1.5 rounded-lg text-muted hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900 truncate">{displayValue}</span>
              {isMatched && (
                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
              )}
              <button
                onClick={() => startEdit(field, value)}
                className="p-1 rounded text-muted hover:text-accent transition-colors ml-auto shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Claim" wide>
      <div className="space-y-5">
        {/* INPUT STAGE */}
        {stage === 'input' && (
          <>
            <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong className="text-accent">AI-Powered:</strong> Enter whatever you know about the claim. AI will autofill
                the rest by matching against existing patients, insurance companies, and providers.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Claim Number</label>
                <input
                  type="text"
                  value={claimNumber}
                  onChange={(e) => setClaimNumber(e.target.value)}
                  placeholder="Auto-generated if empty"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Date of Service</label>
                <input
                  type="date"
                  value={dateOfService}
                  onChange={(e) => setDateOfService(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Patient Name</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Insurance Company</label>
                <input
                  type="text"
                  value={insuranceName}
                  onChange={(e) => setInsuranceName(e.target.value)}
                  placeholder="e.g. Aetna, BCBS, UHC"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Amount</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. $500 or 500"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>CPT Codes</label>
                <input
                  type="text"
                  value={cptCodes}
                  onChange={(e) => setCptCodes(e.target.value)}
                  placeholder="e.g. 99213, 99214"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Diagnosis Codes</label>
                <input
                  type="text"
                  value={diagnosisCodes}
                  onChange={(e) => setDiagnosisCodes(e.target.value)}
                  placeholder="e.g. Z00.00, J06.9"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional context..."
                  rows={2}
                  className={`${INPUT_CLASS} resize-none`}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-border">
              <button
                onClick={handleAiAutofill}
                disabled={!hasInput}
                className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                AI Autofill
              </button>
            </div>
          </>
        )}

        {/* LOADING STAGE */}
        {stage === 'loading' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">AI is analyzing your claim...</p>
            <p className="text-xs text-muted mt-1">Matching entities and filling in details</p>
          </div>
        )}

        {/* REVIEW STAGE */}
        {stage === 'review' && aiResult && (
          <>
            {/* Confidence bar */}
            <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm font-medium text-gray-900">
                AI Confidence: {Math.round((aiResult.confidence || 0) * 100)}%
              </span>
              <span className="text-xs text-muted ml-auto">Click the pencil icon to edit any field</span>
            </div>

            {/* AI suggestions */}
            {aiResult.suggestions?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {aiResult.suggestions.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent/5 border border-accent/15 text-accent text-xs rounded-full">
                    <Sparkles className="w-3 h-3" />
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Review fields */}
            <div className="bg-white border border-border rounded-lg px-4 py-1">
              <ReviewField label="Claim #" field="claimNumber" value={aiResult.claimNumber} />
              <ReviewField label="Patient" field="patientFirstName" value={`${aiResult.patientFirstName || ''} ${aiResult.patientLastName || ''}`.trim()} isMatched={!!aiResult.matchedPatientId} />
              <ReviewField label="DOB" field="patientDOB" value={aiResult.patientDOB} />
              <ReviewField label="Member ID" field="memberId" value={aiResult.memberId} />
              <ReviewField label="Group #" field="groupNumber" value={aiResult.groupNumber} />
              <ReviewField label="Insurance" field="insuranceName" value={aiResult.insuranceName} isMatched={!!aiResult.matchedInsuranceId} />
              <ReviewField label="Amount" field="amount" value={aiResult.amount} />
              <ReviewField label="Date of Service" field="dateOfService" value={aiResult.dateOfService} />
              <ReviewField label="CPT Codes" field="cptCodes" value={aiResult.cptCodes} />
              <ReviewField label="Diagnosis" field="diagnosisCodes" value={aiResult.diagnosisCodes} />
              <ReviewField label="Status" field="status" value={aiResult.status} />
              <ReviewField label="Priority" field="priority" value={aiResult.priority} />
              <ReviewField label="Aging" field="agingBucket" value={aiResult.agingBucket} />
              <ReviewField label="Notes" field="notes" value={aiResult.notes} />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                onClick={() => { setStage('input'); setAiResult(null); }}
                className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
              >
                Back to Edit
              </button>
              <button
                onClick={handleCreateClaim}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Create Claim
              </button>
            </div>
          </>
        )}

        {/* SAVING STAGE */}
        {stage === 'saving' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">Creating claim...</p>
            <p className="text-xs text-muted mt-1">Saving to database</p>
          </div>
        )}

        {/* DONE STAGE */}
        {stage === 'done' && importResult && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">
              Claim Created
            </h3>
            <p className="text-sm text-muted mb-4">
              Successfully created {importResult.importedCount} claim
            </p>

            <div className="flex items-center justify-center gap-6 text-xs text-muted mb-6">
              {importResult.newPatientsCreated > 0 && (
                <span>{importResult.newPatientsCreated} new patient created</span>
              )}
              {importResult.newInsuranceCreated > 0 && (
                <span>{importResult.newInsuranceCreated} new insurance contact created</span>
              )}
            </div>

            {importResult.errors?.length > 0 && (
              <div className="text-left bg-danger/5 border border-danger/20 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-danger mb-1">Errors:</p>
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-danger/80">{err}</p>
                ))}
              </div>
            )}

            <button
              onClick={handleClose}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
