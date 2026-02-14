import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Upload,
  Search,
  FileText,
  ChevronDown,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useProviderFilter } from '../context/ProviderFilterContext';

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
  'bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none w-full';

const SELECT_CLASS =
  'bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-700 focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer';

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

// ---------------------------------------------------------------------------
// Flag severity helpers
// ---------------------------------------------------------------------------
function getFlagSeverity(flag) {
  const errors = ['missing_claim_number', 'missing_amount', 'missing_dos', 'invalid_date', 'invalid_amount'];
  const warnings = ['missing_patient', 'missing_insurance', 'new_patient', 'new_insurance', 'duplicate_claim', 'format_warning'];
  if (errors.includes(flag)) return 'error';
  if (warnings.includes(flag)) return 'warning';
  return 'info';
}

// ---------------------------------------------------------------------------
// Upload Modal Component
// ---------------------------------------------------------------------------
function UploadClaimsModal({ open, onClose }) {
  const processExcelData = useAction(api.claimImport.processExcelData);
  const bulkImportClaims = useMutation(api.claimImport.bulkImportClaims);
  const fileInputRef = useRef(null);

  // States: idle → parsing → ai_processing → preview → importing → done
  const [stage, setStage] = useState('idle');
  const [fileName, setFileName] = useState('');
  const [rawData, setRawData] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setStage('idle');
    setFileName('');
    setRawData(null);
    setAiResult(null);
    setImportResult(null);
    setError(null);
    setDragOver(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Parse Excel file client-side
  const parseFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setStage('parsing');
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to JSON with headers
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (jsonData.length === 0) {
        throw new Error('The spreadsheet is empty or has no data rows.');
      }

      const headers = Object.keys(jsonData[0]);
      // Clean up row data: convert dates to strings, handle numbers
      const rows = jsonData.map((row) => {
        const cleaned = {};
        for (const [key, val] of Object.entries(row)) {
          if (val instanceof Date) {
            cleaned[key] = val.toISOString().split('T')[0];
          } else {
            cleaned[key] = val;
          }
        }
        return cleaned;
      });

      setRawData({ headers, rows, sheetName });
      setStage('ai_processing');

      // Send to AI for processing
      const result = await processExcelData({ headers, rows, sheetName });
      setAiResult(result);
      setStage('preview');
    } catch (err) {
      setError(err.message || 'Failed to process file');
      setStage('idle');
    }
  }, [processExcelData]);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  // Import confirmed claims
  const handleImport = async () => {
    if (!aiResult?.claims) return;
    setStage('importing');
    setError(null);

    try {
      // Filter out claims with critical errors
      const validClaims = aiResult.claims.filter((c) => {
        const hasErrors = (c.flags || []).some((f) => getFlagSeverity(f) === 'error');
        return !hasErrors;
      });

      if (validClaims.length === 0) {
        setError('No valid claims to import. Fix the flagged errors and try again.');
        setStage('preview');
        return;
      }

      const result = await bulkImportClaims({
        claims: validClaims.map((c) => ({
          claimNumber: c.claimNumber || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          patientFirstName: c.patientFirstName || 'Unknown',
          patientLastName: c.patientLastName || 'Patient',
          patientDOB: c.patientDOB || '1900-01-01',
          memberId: c.memberId || `MBR-${Date.now()}`,
          groupNumber: c.groupNumber || undefined,
          insuranceName: c.insuranceName || 'Unknown Insurance',
          matchedPatientId: c.matchedPatientId || undefined,
          matchedInsuranceId: c.matchedInsuranceId || undefined,
          matchedProviderId: c.matchedProviderId || undefined,
          amount: typeof c.amount === 'number' ? c.amount : 0,
          dateOfService: c.dateOfService || new Date().toISOString().split('T')[0],
          dateSubmitted: c.dateSubmitted || undefined,
          cptCodes: c.cptCodes || undefined,
          diagnosisCodes: c.diagnosisCodes || undefined,
          status: c.status || 'pending',
          priority: c.priority || 'medium',
          agingBucket: c.agingBucket || '0-30',
          notes: c.notes || undefined,
        })),
      });

      setImportResult(result);
      setStage('done');
    } catch (err) {
      setError(err.message || 'Import failed');
      setStage('preview');
    }
  };

  // Count flags by severity
  const errorCount = aiResult?.claims?.filter((c) =>
    (c.flags || []).some((f) => getFlagSeverity(f) === 'error')
  ).length || 0;
  const warningCount = aiResult?.claims?.filter((c) =>
    (c.flags || []).some((f) => getFlagSeverity(f) === 'warning') &&
    !(c.flags || []).some((f) => getFlagSeverity(f) === 'error')
  ).length || 0;
  const cleanCount = (aiResult?.claims?.length || 0) - errorCount - warningCount;

  return (
    <Modal open={open} onClose={handleClose} title="Upload Claims" wide>
      <div className="space-y-5">
        {/* IDLE: File upload area */}
        {stage === 'idle' && (
          <>
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-accent bg-accent/5'
                  : 'border-border-light hover:border-accent/40 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <FileSpreadsheet className="w-10 h-10 text-accent/50 mx-auto mb-3" />
              <p className="text-sm text-gray-900 font-medium mb-1">
                Drop your Excel file here or click to browse
              </p>
              <p className="text-xs text-muted">
                Supports .xlsx, .xls, .csv — any column structure
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong className="text-accent">AI-Powered Import:</strong> Our AI will automatically
                detect your column structure, map fields to our system, match existing patients and
                insurance companies, calculate aging buckets, and flag any data quality issues.
                No fixed format required.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
                <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}
          </>
        )}

        {/* PARSING: Reading file */}
        {stage === 'parsing' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">Reading {fileName}...</p>
            <p className="text-xs text-muted mt-1">Parsing spreadsheet data</p>
          </div>
        )}

        {/* AI PROCESSING: Sending to OpenAI */}
        {stage === 'ai_processing' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">AI is analyzing your data...</p>
            <p className="text-xs text-muted mt-1">
              Mapping columns, matching entities, validating {rawData?.rows?.length} rows
            </p>
          </div>
        )}

        {/* PREVIEW: Show AI results */}
        {stage === 'preview' && aiResult && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-4 p-3 bg-surface rounded-lg border border-border">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm font-medium text-gray-900">{cleanCount} valid</span>
              </div>
              {warningCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-warn" />
                  <span className="text-sm font-medium text-warn">{warningCount} warnings</span>
                </div>
              )}
              {errorCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-danger" />
                  <span className="text-sm font-medium text-danger">{errorCount} errors</span>
                </div>
              )}
              <span className="text-xs text-muted ml-auto">{aiResult.claims?.length} total rows</span>
            </div>

            {/* Column mapping info */}
            {aiResult.columnMapping && (
              <details className="group">
                <summary className="text-xs text-accent cursor-pointer hover:text-accent-hover font-medium">
                  View column mapping
                </summary>
                <div className="mt-2 bg-surface rounded-lg p-3 border border-border">
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(aiResult.columnMapping).map(([orig, mapped]) => (
                      <div key={orig} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 truncate">{orig}</span>
                        <span className="text-muted">→</span>
                        <span className="text-gray-900 font-data">{String(mapped)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {/* Claims preview table */}
            <div className="max-h-[350px] overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-surface sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted font-medium">Status</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Claim #</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Patient</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Insurance</th>
                    <th className="px-3 py-2 text-right text-muted font-medium">Amount</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(aiResult.claims || []).map((claim, i) => {
                    const hasError = (claim.flags || []).some((f) => getFlagSeverity(f) === 'error');
                    const hasWarning = (claim.flags || []).some((f) => getFlagSeverity(f) === 'warning');
                    return (
                      <tr key={i} className={hasError ? 'bg-danger/5' : hasWarning ? 'bg-warn/5' : ''}>
                        <td className="px-3 py-2">
                          {hasError ? (
                            <XCircle className="w-3.5 h-3.5 text-danger" />
                          ) : hasWarning ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-warn" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-data text-accent">{claim.claimNumber || '--'}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {claim.patientName || `${claim.patientFirstName} ${claim.patientLastName}` || '--'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{claim.insuranceName || '--'}</td>
                        <td className="px-3 py-2 text-right font-data text-gray-900">
                          {claim.amount != null ? formatCurrency(claim.amount) : '--'}
                        </td>
                        <td className="px-3 py-2">
                          {(claim.flagDetails || claim.flags || []).length > 0 && (
                            <span className={`text-xs ${hasError ? 'text-danger' : 'text-warn'}`}>
                              {(claim.flagDetails || claim.flags || []).join('; ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
                <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
              >
                Upload Different File
              </button>
              <button
                onClick={handleImport}
                disabled={cleanCount + warningCount === 0}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import {cleanCount + warningCount} Claim{cleanCount + warningCount !== 1 ? 's' : ''}
                {errorCount > 0 && <span className="text-white/70">({errorCount} skipped)</span>}
              </button>
            </div>
          </>
        )}

        {/* IMPORTING */}
        {stage === 'importing' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">Importing claims...</p>
            <p className="text-xs text-muted mt-1">Creating records in the database</p>
          </div>
        )}

        {/* DONE */}
        {stage === 'done' && importResult && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">
              Import Complete
            </h3>
            <p className="text-sm text-muted mb-4">
              Successfully imported {importResult.importedCount} of {importResult.totalAttempted} claims
            </p>

            <div className="flex items-center justify-center gap-6 text-xs text-muted mb-6">
              {importResult.newPatientsCreated > 0 && (
                <span>{importResult.newPatientsCreated} new patients created</span>
              )}
              {importResult.newInsuranceCreated > 0 && (
                <span>{importResult.newInsuranceCreated} new insurance contacts created</span>
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

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function ClaimsPage() {
  const navigate = useNavigate();
  const { selectedProviderId } = useProviderFilter();
  const allClaims = useQuery(api.claims.list);
  const claims = selectedProviderId
    ? (allClaims ?? []).filter((c) => c.providerId === selectedProviderId)
    : allClaims;
  const patients = useQuery(api.patients.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [agingFilter, setAgingFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = allClaims === undefined;

  // Build lookup maps for display
  const patientMap = {};
  (patients ?? []).forEach((p) => { patientMap[p._id] = `${p.firstName} ${p.lastName}`; });
  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });

  // Apply filters
  const filteredClaims = (claims ?? []).filter((claim) => {
    if (statusFilter && claim.status !== statusFilter) return false;
    if (priorityFilter && claim.priority !== priorityFilter) return false;
    if (agingFilter && claim.agingBucket !== agingFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesClaimNum = claim.claimNumber?.toLowerCase().includes(q);
      const patientName = patientMap[claim.patientId] || '';
      const insuranceName = insuranceMap[claim.insuranceContactId] || '';
      const matchesPatient = patientName.toLowerCase().includes(q);
      const matchesInsurance = insuranceName.toLowerCase().includes(q);
      if (!matchesClaimNum && !matchesPatient && !matchesInsurance) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Claims</h1>
          <p className="text-sm text-muted mt-1">
            {!isLoading && `${filteredClaims.length} claim${filteredClaims.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" />
          Upload Claims
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-border rounded-xl p-4 shadow-sm">
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
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-white sticky top-0 z-10">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Claim #</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Patient</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Insurance</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">DOS</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Status</th>
                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Priority</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Age</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted font-medium">Actions</th>
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
                          : 'Upload an Excel file to import your claims.'
                      }
                      action={
                        !statusFilter && !priorityFilter && !agingFilter && !searchQuery ? (
                          <button
                            onClick={() => setUploadModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            <Upload className="w-4 h-4" />
                            Upload Claims
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
                    <td className="px-4 py-3 font-data text-accent whitespace-nowrap">{claim.claimNumber}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{patientMap[claim.patientId] ?? '---'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{insuranceMap[claim.insuranceContactId] ?? '---'}</td>
                    <td className="px-4 py-3 font-data text-gray-900 text-right whitespace-nowrap">{formatCurrency(claim.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(claim.dateOfService)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={claim.status ?? 'unknown'} /></td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT_COLORS[claim.priority] ?? 'bg-gray-400'}`} />
                        <span className="text-gray-600 capitalize text-xs">{claim.priority ?? '---'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-data text-xs">{claim.agingBucket ?? '---'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/claims/${claim._id}`); }}
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

      {/* Upload Claims Modal */}
      <UploadClaimsModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
    </div>
  );
}
