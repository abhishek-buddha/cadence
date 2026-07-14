import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from './Modal';

// Normalize a header/label so we can look up cells regardless of asterisks,
// parentheticals, spacing or case (e.g. "Company Name*" -> "companyname").
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build a normalized-header -> value map for one spreadsheet row.
function rowMap(row) {
  const m = {};
  for (const [k, v] of Object.entries(row)) m[norm(k)] = v;
  return m;
}

function get(m, ...keys) {
  for (const k of keys) {
    const v = m[norm(k)];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function findSheet(workbook, name) {
  const target = norm(name);
  return workbook.SheetNames.find((n) => norm(n) === target);
}

// Compile a payer's ordered flow steps into an agent playbook + raw transcript.
function compileSteps(steps) {
  const ordered = [...steps].sort((a, b) => a.step - b.step);
  const playbook = ordered
    .map((s) => {
      const head = `${s.step}. (${s.state}) ${s.action}`.trim();
      const branch = s.branch && !/^none\.?$/i.test(s.branch.trim())
        ? ` — On exception: ${s.branch}`
        : '';
      return head + branch;
    })
    .join('\n');
  const transcript = ordered
    .map((s) => `Step ${s.step} | ${s.state} | ${s.action} | ${s.branch}`)
    .join('\n');
  return { playbook, transcript };
}

export default function BulkImportInsuranceModal({ open, onClose }) {
  const bulkImport = useMutation(api.insuranceContacts.bulkImportContacts);
  const existing = useQuery(api.insuranceContacts.list);
  const fileInputRef = useRef(null);

  const [stage, setStage] = useState('idle'); // idle | parsing | preview | importing | done
  const [fileName, setFileName] = useState('');
  const [payers, setPayers] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setStage('idle');
    setFileName('');
    setPayers([]);
    setResult(null);
    setError(null);
    setDragOver(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const parseFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setStage('parsing');
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      const payersSheetName = findSheet(workbook, 'Payers') || workbook.SheetNames[0];
      const flowSheetName = findSheet(workbook, 'IVR Flow');
      if (!payersSheetName) throw new Error('No "Payers" sheet found in the workbook.');

      const payerRows = XLSX.utils.sheet_to_json(workbook.Sheets[payersSheetName], { defval: '' });
      const flowRows = flowSheetName
        ? XLSX.utils.sheet_to_json(workbook.Sheets[flowSheetName], { defval: '' })
        : [];

      if (payerRows.length === 0) throw new Error('The Payers sheet has no data rows.');

      // Group IVR Flow steps by normalized company name.
      const stepsByPayer = {};
      for (const raw of flowRows) {
        const m = rowMap(raw);
        const company = get(m, 'company name', 'company', 'payer', 'name');
        if (!company) continue;
        const stepNum = Number(get(m, 'step')) || 0;
        (stepsByPayer[norm(company)] ||= []).push({
          step: stepNum,
          state: get(m, 'state'),
          action: get(m, 'action / dialog', 'action', 'dialog', 'action dialog'),
          branch: get(m, 'branch conditions', 'branch', 'conditions'),
        });
      }

      const parsed = payerRows
        .map((raw) => {
          const m = rowMap(raw);
          const name = get(m, 'company name', 'name', 'company');
          if (!name) return null;

          const phone = get(m, 'phone number', 'phone');
          const steps = stepsByPayer[norm(name)] || [];
          const { playbook, transcript } = steps.length
            ? compileSteps(steps)
            : { playbook: '', transcript: '' };

          const avgRaw = get(m, 'avg hold time (min)', 'avg hold time', 'avghold');
          const avgNum = avgRaw ? Number(avgRaw) : undefined;

          return {
            contactId: get(m, 'contact id (optional)', 'contact id') || undefined,
            name,
            phone,
            payerKind: get(m, 'payer type', 'payer kind') || undefined,
            payerId: get(m, 'payer id') || undefined,
            department: get(m, 'department') || undefined,
            humanAgentNumber: get(m, 'human agent number') || undefined,
            hours: get(m, 'hours') || undefined,
            avgHoldTime: Number.isFinite(avgNum) ? avgNum : undefined,
            verificationRequirements: get(m, 'verification requirements') || undefined,
            notes: get(m, 'notes') || undefined,
            // The whole flow is compiled into the ivrInstructions playbook, so we
            // do NOT populate the separate DTMF-steps or voice-phrase tables here
            // (those are optional UI extras for simpler payers). Keep both toggles
            // off so they never show as "enabled but empty".
            voiceIvrEnabled: false,
            ivrEnabled: false,
            ivrInstructions: playbook || undefined,
            ivrSourceTranscript: transcript || undefined,
            _stepCount: steps.length,
          };
        })
        .filter(Boolean);

      if (parsed.length === 0) throw new Error('No payers with a Company Name were found.');

      setPayers(parsed);
      setStage('preview');
    } catch (err) {
      setError(err.message || 'Failed to parse file');
      setStage('idle');
    }
  }, []);

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }

  // Does this parsed payer match an existing contact (by id or name)?
  function matchStatus(p) {
    if (!existing) return 'new';
    const byId = p.contactId && existing.some((c) => c._id === p.contactId);
    const byName = existing.some((c) => c.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    return byId || byName ? 'update' : 'new';
  }

  async function handleImport() {
    setStage('importing');
    setError(null);
    try {
      // Strip preview-only fields before sending.
      const contacts = payers.map(({ _stepCount, ...rest }) => rest);
      const res = await bulkImport({ contacts });
      setResult(res);
      setStage('done');
    } catch (err) {
      setError(err.message || 'Import failed');
      setStage('preview');
    }
  }

  const newCount = payers.filter((p) => matchStatus(p) === 'new').length;
  const updateCount = payers.length - newCount;

  return (
    <Modal open={open} onClose={handleClose} title="Upload Insurance Workbook" wide>
      <div className="space-y-5">
        {stage === 'idle' && (
          <>
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-accent bg-accent/5' : 'border-border-light hover:border-accent/40 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
            >
              <FileSpreadsheet className="w-10 h-10 text-accent/50 mx-auto mb-3" />
              <p className="text-sm text-gray-900 font-medium mb-1">
                Drop your Insurance workbook here or click to browse
              </p>
              <p className="text-xs text-muted">Supports .xlsx, .xls</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong className="text-accent">Two sheets:</strong> a <strong>Payers</strong> sheet
                (one row per company — Company Name and Phone are required) and an{' '}
                <strong>IVR Flow</strong> sheet (step-by-step rows linked by Company Name). The IVR
                Flow steps are compiled into each payer's navigation playbook. Existing payers are
                matched by Company Name and updated; others are created.
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

        {stage === 'parsing' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">Reading {fileName}...</p>
            <p className="text-xs text-muted mt-1">Parsing sheets and compiling IVR playbooks</p>
          </div>
        )}

        {stage === 'preview' && (
          <>
            <div className="flex items-center gap-4 p-3 bg-surface rounded-lg border border-border">
              <div className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-success" />
                <span className="text-sm font-medium text-gray-900">{newCount} new</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">{updateCount} update</span>
              </div>
              <span className="text-xs text-muted ml-auto">{payers.length} payers</span>
            </div>

            <div className="max-h-[350px] overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-surface sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted font-medium">Action</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Company</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Phone</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Type</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">IVR Steps</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Human Agent #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payers.map((p, i) => {
                    const status = matchStatus(p);
                    const missingPhone = !p.phone;
                    return (
                      <tr key={i} className={missingPhone ? 'bg-danger/5' : ''}>
                        <td className="px-3 py-2">
                          {status === 'update' ? (
                            <span className="inline-flex items-center gap-1 text-accent"><RefreshCw className="w-3 h-3" />Update</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-success"><Plus className="w-3 h-3" />New</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{p.name}</td>
                        <td className="px-3 py-2 text-gray-700 font-data">
                          {p.phone || <span className="text-danger">missing</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{p.payerKind || '--'}</td>
                        <td className="px-3 py-2 text-gray-700">{p._stepCount || 0}</td>
                        <td className="px-3 py-2 text-gray-700 font-data">{p.humanAgentNumber || '--'}</td>
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

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button onClick={reset} className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors">
                Upload Different File
              </button>
              <button
                onClick={handleImport}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import {payers.length} Payer{payers.length !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {stage === 'importing' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">Importing payers...</p>
            <p className="text-xs text-muted mt-1">Creating and updating records</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">Upload Complete</h3>
            <p className="text-sm text-muted mb-4">
              {result.created} created · {result.updated} updated
            </p>
            {result.errors?.length > 0 && (
              <div className="text-left bg-danger/5 border border-danger/20 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-danger mb-1">{result.errors.length} row(s) skipped:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-danger/80">{e}</p>
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
