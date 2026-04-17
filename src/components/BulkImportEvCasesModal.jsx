import { useState, useRef, useCallback } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from './Modal';

function getFlagSeverity(flag) {
  const errors = ['missing_patient', 'missing_payer', 'missing_cdt', 'invalid_dos'];
  const warnings = ['new_patient', 'new_payer', 'duplicate_case', 'format_warning'];
  if (errors.includes(flag)) return 'error';
  if (warnings.includes(flag)) return 'warning';
  return 'info';
}

export default function BulkImportEvCasesModal({ open, onClose }) {
  const processExcelData = useAction(api.dentalCases?.processExcelData);
  const bulkImport = useMutation(api.dentalCases?.bulkImport);
  const fileInputRef = useRef(null);

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
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (jsonData.length === 0) {
        throw new Error('The spreadsheet is empty or has no data rows.');
      }

      const headers = Object.keys(jsonData[0]);
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

      if (!processExcelData) {
        throw new Error('Dental import module not yet available.');
      }
      const result = await processExcelData({ headers, rows, sheetName });
      setAiResult(result);
      setStage('preview');
    } catch (err) {
      setError(err.message || 'Failed to process file');
      setStage('idle');
    }
  }, [processExcelData]);

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

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  async function handleImport() {
    if (!aiResult?.cases) return;
    setStage('importing');
    setError(null);

    try {
      const validCases = aiResult.cases.filter((c) => {
        const hasErrors = (c.flags || []).some((f) => getFlagSeverity(f) === 'error');
        return !hasErrors;
      });

      if (validCases.length === 0) {
        setError('No valid cases to import. Fix the flagged errors and try again.');
        setStage('preview');
        return;
      }

      const result = await bulkImport({ cases: validCases });
      setImportResult(result);
      setStage('done');
    } catch (err) {
      setError(err.message || 'Import failed');
      setStage('preview');
    }
  }

  const errorCount = aiResult?.cases?.filter((c) =>
    (c.flags || []).some((f) => getFlagSeverity(f) === 'error')
  ).length || 0;
  const warningCount = aiResult?.cases?.filter((c) =>
    (c.flags || []).some((f) => getFlagSeverity(f) === 'warning') &&
    !(c.flags || []).some((f) => getFlagSeverity(f) === 'error')
  ).length || 0;
  const cleanCount = (aiResult?.cases?.length || 0) - errorCount - warningCount;

  return (
    <Modal open={open} onClose={handleClose} title="Import Dental EV Cases" wide>
      <div className="space-y-5">
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
              onDragLeave={() => setDragOver(false)}
            >
              <FileSpreadsheet className="w-10 h-10 text-accent/50 mx-auto mb-3" />
              <p className="text-sm text-gray-900 font-medium mb-1">
                Drop your Excel/CSV file here or click to browse
              </p>
              <p className="text-xs text-muted">Supports .xlsx, .xls, .csv</p>
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
                <strong className="text-accent">Expected columns:</strong> Patient Name, Member ID,
                Payer, CDT Codes (comma-separated), Date of Service, Provider. AI will map columns
                and flag data quality issues.
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

        {(stage === 'parsing' || stage === 'ai_processing') && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">
              {stage === 'parsing' ? `Reading ${fileName}...` : 'AI is analyzing your data...'}
            </p>
            <p className="text-xs text-muted mt-1">
              {stage === 'parsing'
                ? 'Parsing spreadsheet'
                : `Mapping columns and validating ${rawData?.rows?.length} rows`}
            </p>
          </div>
        )}

        {stage === 'preview' && aiResult && (
          <>
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
              <span className="text-xs text-muted ml-auto">{aiResult.cases?.length} total rows</span>
            </div>

            <div className="max-h-[350px] overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-surface sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted font-medium">Status</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Patient</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Payer</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">CDT Codes</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">DOS</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(aiResult.cases || []).map((c, i) => {
                    const hasError = (c.flags || []).some((f) => getFlagSeverity(f) === 'error');
                    const hasWarning = (c.flags || []).some((f) => getFlagSeverity(f) === 'warning');
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
                        <td className="px-3 py-2 text-gray-700">{c.patientName || '--'}</td>
                        <td className="px-3 py-2 text-gray-700">{c.payerName || '--'}</td>
                        <td className="px-3 py-2 font-data text-accent">{(c.cdtCodes || []).join(', ') || '--'}</td>
                        <td className="px-3 py-2 text-gray-700 font-data">{c.dateOfService || '--'}</td>
                        <td className="px-3 py-2">
                          {(c.flagDetails || c.flags || []).length > 0 && (
                            <span className={`text-xs ${hasError ? 'text-danger' : 'text-warn'}`}>
                              {(c.flagDetails || c.flags || []).join('; ')}
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
                Import All
              </button>
            </div>
          </>
        )}

        {stage === 'importing' && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium">Importing cases...</p>
            <p className="text-xs text-muted mt-1">Creating records in the database</p>
          </div>
        )}

        {stage === 'done' && importResult && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">Import Complete</h3>
            <p className="text-sm text-muted mb-6">
              Successfully imported {importResult.importedCount || 0} of {importResult.totalAttempted || 0} cases
            </p>
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
