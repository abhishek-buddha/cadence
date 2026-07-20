import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  ArrowLeft,
  Phone,
  FileText,
  User,
  Building2,
  Stethoscope,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Hash,
  Calendar,
  DollarSign,
  MessageSquare,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import LiveCallMonitor from '../components/LiveCallMonitor';

// ---------------------------------------------------------------------------
// Priority indicator pill
// ---------------------------------------------------------------------------
const priorityConfig = {
  high: { bg: 'bg-danger/10', text: 'text-danger', label: 'High' },
  medium: { bg: 'bg-warn/10', text: 'text-warn', label: 'Medium' },
  low: { bg: 'bg-success/10', text: 'text-success', label: 'Low' },
};

function PriorityBadge({ priority }) {
  const config = priorityConfig[priority] || priorityConfig.low;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      <AlertTriangle className="w-3 h-3" />
      {config.label} Priority
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shimmer placeholder for loading state
// ---------------------------------------------------------------------------
function Shimmer({ className = '' }) {
  return (
    <div className={`animate-pulse rounded bg-surface ${className}`} />
  );
}

function ShimmerCard() {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <Shimmer className="h-4 w-32" />
      </div>
      <div className="px-5 py-4 space-y-3">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-3/4" />
        <Shimmer className="h-3 w-1/2" />
        <Shimmer className="h-3 w-5/6" />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top bar shimmer */}
      <div className="flex items-center gap-4">
        <Shimmer className="h-9 w-9 rounded-lg" />
        <Shimmer className="h-6 w-48" />
        <Shimmer className="h-6 w-24 rounded-full" />
      </div>

      {/* Call button shimmer */}
      <div className="bg-white border border-border rounded-xl p-8 flex justify-center">
        <Shimmer className="h-14 w-64 rounded-xl" />
      </div>

      {/* Info cards shimmer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
      </div>

      {/* Result shimmer */}
      <ShimmerCard />

      {/* Timeline shimmer */}
      <ShimmerCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info field helper used in detail cards
// ---------------------------------------------------------------------------
function InfoField({ label, value, mono = false }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? 'font-data' : ''}`}>
        {value || <span className="text-muted/50 italic">--</span>}
      </p>
    </div>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm text-gray-900 text-right ${mono ? 'font-data' : ''}`}>
        {value || <span className="text-muted/50 italic">--</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------
function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  let color = 'bg-danger';
  if (pct >= 80) color = 'bg-success';
  else if (pct >= 50) color = 'bg-warn';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted uppercase tracking-wider font-medium">Confidence</p>
        <span className="text-xs font-data text-gray-900">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Call history table row
// ---------------------------------------------------------------------------
function CallHistoryRow({ call }) {
  const [expanded, setExpanded] = useState(false);

  const startDate = call.startedAt ? new Date(call.startedAt) : null;
  const callTime = startDate
    ? startDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '--';

  const durationStr = call.duration
    ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`
    : '--';

  const hasDetail = !!(call.transcript || call.errorMessage);

  return (
    <>
      <tr
        onClick={() => hasDetail && setExpanded((e) => !e)}
        className={`${hasDetail ? 'cursor-pointer hover:bg-gray-50/80' : ''} transition-colors`}
      >
        <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">{callTime}</td>
        <td className="px-4 py-2.5 text-sm font-data text-gray-600 whitespace-nowrap">{durationStr}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={call.status} />
            {hasDetail && (
              expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
            )}
          </div>
        </td>
      </tr>
      {expanded && call.transcript && (
        <tr>
          <td colSpan={3} className="px-4 pb-3 bg-surface/50">
            <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2 pt-2">Transcript</p>
            <pre className="text-xs text-gray-600 font-data whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed bg-white rounded-lg p-3 border border-border">
              {call.transcript}
            </pre>
          </td>
        </tr>
      )}
      {expanded && call.errorMessage && (
        <tr>
          <td colSpan={3} className="px-4 pb-3 bg-surface/50">
            <div className="flex items-start gap-2 pt-2">
              <XCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <p className="text-xs text-danger font-data">{call.errorMessage}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------
function DetailCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-display font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function ClaimDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ---- Convex data --------------------------------------------------------
  const data = useQuery(api.claims.getWithDetails, id ? { id } : 'skip');
  const initiateCall = useAction(api.callActions.initiateCall);

  // ---- Local state --------------------------------------------------------
  const [callState, setCallState] = useState('idle'); // idle | calling | in_progress | error
  const [callError, setCallError] = useState(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [piiVisible, setPiiVisible] = useState(false);
  const [localCompletedCallIds, setLocalCompletedCallIds] = useState(new Set());

  const handleCallComplete = (callId) => {
    setLocalCompletedCallIds(prev => {
      const next = new Set(prev);
      next.add(callId);
      return next;
    });
  };

  // ---- Loading / Error states ---------------------------------------------
  if (data === undefined) {
    return <LoadingSkeleton />;
  }

  if (data === null || !data.claim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="bg-white border border-border rounded-xl p-10 text-center max-w-md shadow-sm">
          <div className="w-14 h-14 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-7 h-7 text-danger" />
          </div>
          <h2 className="font-display font-bold text-xl text-gray-900 mb-2">Claim Not Found</h2>
          <p className="text-sm text-muted mb-6">
            The claim you are looking for does not exist or you do not have access to it.
          </p>
          <button
            onClick={() => navigate('/claims')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Claims
          </button>
        </div>
      </div>
    );
  }

  const { claim, patient, insurance, provider, calls, latestResult } = data;

  // ---- Helpers ------------------------------------------------------------
  const formatAmount = (cents) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // ---- Call handler -------------------------------------------------------
  const handleCallInsurance = async () => {
    if (callState === 'calling' || callState === 'in_progress') return;

    setCallState('calling');
    setCallError(null);

    try {
      await initiateCall({ claimId: id });
      setCallState('idle'); // Reset to idle; real-time Convex data drives the button state
    } catch (err) {
      setCallState('error');
      setCallError(err.message || 'An unexpected error occurred while initiating the call.');
      setErrorModalOpen(true);
    }
  };

  // ---- PII masking --------------------------------------------------------
  function maskValue(value) {
    if (piiVisible || !value) return value;
    if (value.length <= 2) return '***';
    return value[0] + '*'.repeat(Math.min(value.length - 2, 8)) + value[value.length - 1];
  }

  function maskDOB(dateStr) {
    if (piiVisible) return formatDate(dateStr);
    if (!dateStr) return '--';
    return '*** **, ****';
  }

  // ---- Derived values -----------------------------------------------------
  // Treat calls stuck as in_progress for >30 min as stale (not active)
  const isCallStale = (call) => {
    if (!call?.startedAt) return false;
    const elapsed = Date.now() - new Date(call.startedAt).getTime();
    return elapsed > 30 * 60 * 1000; // 30 minutes
  };

  // Also show LiveCallMonitor for recently completed calls (30s grace period)
  // so the user can see the "Call Completed" summary and transcript
  const isRecentlyCompleted = (call) => {
    if (call?.status !== 'completed' || !call?.completedAt) return false;
    return Date.now() - new Date(call.completedAt).getTime() < 30000;
  };

  const isLocallyDone = (c) => localCompletedCallIds.has(c._id);

  const hasActiveCall = callState === 'calling' || callState === 'in_progress' ||
    (calls && calls.length > 0 && ['initiating', 'ringing', 'in_progress'].includes(calls[0].status) && !isCallStale(calls[0]) && !isLocallyDone(calls[0])) ||
    (calls && calls.length > 0 && isRecentlyCompleted(calls[0]) && !isLocallyDone(calls[0]));

  const activeCall = calls?.find((c) =>
    ['initiating', 'ringing', 'in_progress'].includes(c.status) && !isCallStale(c) && !isLocallyDone(c)
  ) || calls?.find((c) => isRecentlyCompleted(c) && !isLocallyDone(c));

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ------------------------------------------------------------------ */}
      {/* TOP BAR                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/claims')}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-gray-900 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to claims
          </button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
              Claim {claim.claimNumber}
            </h1>
            <StatusBadge status={claim.status} />
            <PriorityBadge priority={claim.priority} />
            {claim.agingBucket && (
              <span className="text-xs font-data text-muted bg-surface px-2.5 py-1 rounded-full border border-border">
                <Clock className="w-3 h-3 inline mr-1" />
                {claim.agingBucket}
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-1">
            {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
            {insurance?.name && <> · {insurance.name}</>}
            {claim.cptCodes?.length > 0 && <> · <span className="font-data">{claim.cptCodes.join(', ')}</span></>}
          </p>
        </div>

        {!activeCall && (
          <button
            onClick={handleCallInsurance}
            disabled={callState === 'calling' || callState === 'in_progress' || hasActiveCall}
            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 ${
              callState === 'calling'
                ? 'bg-accent/80 cursor-wait'
                : callState === 'in_progress' || hasActiveCall
                  ? 'bg-accent/60 cursor-default'
                  : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            <Phone className={`w-4 h-4 ${callState === 'calling' ? 'animate-pulse' : ''}`} />
            {callState === 'calling' ? (
              <>Calling...</>
            ) : callState === 'in_progress' || hasActiveCall ? (
              <>
                <span className="status-dot-pulse w-1.5 h-1.5 rounded-full bg-white inline-block" />
                Call in Progress
              </>
            ) : (
              <>
                Call Insurance
                {insurance?.phone && <span className="font-data text-white/70">· {insurance.phone}</span>}
              </>
            )}
          </button>
        )}
      </div>

      {callState === 'error' && (
        <p className="text-sm text-danger flex items-center gap-1.5">
          <XCircle className="w-4 h-4" />
          Call failed.{' '}
          <button
            onClick={() => setErrorModalOpen(true)}
            className="underline underline-offset-2 hover:text-danger/80"
          >
            View details
          </button>
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LIVE CALL MONITOR                                                   */}
      {/* ------------------------------------------------------------------ */}
      {activeCall && (
        <LiveCallMonitor call={activeCall} insurance={insurance} onComplete={handleCallComplete} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* INFO CARDS GRID (2x2)                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {/* Claim Info */}
        <DetailCard icon={FileText} title="Claim Information">
          <div className="divide-y divide-border/50">
            <InfoRow label="Claim #" value={claim.claimNumber} mono />
            <InfoRow label="Amount" value={formatAmount(claim.amount)} mono />
            <InfoRow label="Date of service" value={formatDate(claim.dateOfService)} />
            <InfoRow label="Date submitted" value={formatDate(claim.dateSubmitted)} />
            <InfoRow label="CPT codes" value={claim.cptCodes?.join(', ')} mono />
            <InfoRow label="Diagnosis codes" value={claim.diagnosisCodes?.join(', ')} mono />
            <InfoRow label="Aging bucket" value={claim.agingBucket} />
            <InfoRow label="Reference" value={claim.referenceNumber} mono />
          </div>
          {claim.notes && (
            <div className="mt-3 pt-3 border-t border-border">
              <InfoField label="Notes" value={claim.notes} />
            </div>
          )}
        </DetailCard>

        {/* Patient Info (with PII masking) */}
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
            <User className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-display font-semibold text-gray-900">Patient Information</h3>
            <button
              onClick={() => setPiiVisible((v) => !v)}
              className={`ml-auto p-1.5 rounded-lg transition-colors ${piiVisible ? 'text-accent bg-accent/10' : 'text-muted hover:text-gray-700 hover:bg-gray-100'}`}
              title={piiVisible ? 'Hide patient data' : 'Reveal patient data'}
            >
              {piiVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          <div className="px-5 py-4 divide-y divide-border/50">
            <InfoRow
              label="Full name"
              value={patient ? `${maskValue(patient.firstName)} ${maskValue(patient.lastName)}` : '--'}
            />
            <InfoRow label="Date of birth" value={patient ? maskDOB(patient.dateOfBirth) : '--'} />
            <InfoRow label="Member ID" value={maskValue(patient?.memberId)} mono />
            <InfoRow label="Group number" value={maskValue(patient?.groupNumber)} mono />
          </div>
        </div>

        {/* Insurance Info */}
        <DetailCard icon={Building2} title="Insurance Information">
          <div className="divide-y divide-border/50">
            <InfoRow label="Company" value={insurance?.name} />
            <InfoRow label="Phone" value={insurance?.phone} mono />
          </div>
        </DetailCard>

        {/* Provider Info */}
        <DetailCard icon={Stethoscope} title="Provider Information">
          <div className="divide-y divide-border/50">
            <InfoRow label="Practice" value={provider?.practiceName} />
            <InfoRow label="NPI" value={provider?.npi} mono />
            <InfoRow label="Tax ID" value={provider?.taxId} mono />
            <InfoRow label="Phone" value={provider?.phone} mono />
          </div>
        </DetailCard>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* LATEST CALL RESULT + CALL HISTORY                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-display font-semibold text-gray-900">Latest call result and next steps</h3>
          </div>
          {latestResult ? (
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-700">
                Claim status: <span className="font-medium text-gray-900">{latestResult.claimStatus || 'Unknown'}</span>
                {latestResult.referenceNumber && <> · Reference: <span className="font-data">{latestResult.referenceNumber}</span></>}
              </p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {latestResult.paidAmount != null && <InfoField label="Paid Amount" value={formatAmount(latestResult.paidAmount)} mono />}
                {latestResult.paidDate && <InfoField label="Paid Date" value={formatDate(latestResult.paidDate)} />}
                {latestResult.checkOrEftNumber && <InfoField label="Check / EFT #" value={latestResult.checkOrEftNumber} mono />}
                {latestResult.denialCode && <InfoField label="Denial Code (CARC)" value={latestResult.denialCode} mono />}
                {latestResult.denialReason && <InfoField label="Denial Reason" value={latestResult.denialReason} />}
                {latestResult.remarkCode && <InfoField label="RARC Code" value={latestResult.remarkCode} mono />}
                {latestResult.appealDeadline && <InfoField label="Appeal Deadline" value={formatDate(latestResult.appealDeadline)} />}
                {latestResult.expectedDecisionDate && <InfoField label="Expected Decision" value={formatDate(latestResult.expectedDecisionDate)} />}
                {latestResult.repName && <InfoField label="Rep Name" value={latestResult.repName} />}
                {latestResult.missingDocuments && <InfoField label="Missing Documents" value={latestResult.missingDocuments} />}
              </div>

              {latestResult.nextSteps && (
                <p className="text-sm text-gray-600 leading-relaxed pt-3 border-t border-border">
                  {latestResult.nextSteps}
                </p>
              )}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <Info className="w-6 h-6 text-muted/40 mx-auto mb-2" />
              <p className="text-sm text-muted/60">No call results yet. Initiate a call to get AI-extracted claim data.</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
            <Phone className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-display font-semibold text-gray-900">Call history</h3>
          </div>
          {calls && calls.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold">Call time</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold">Duration</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {calls.map((call) => (
                  <CallHistoryRow key={call._id} call={call} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-8 text-center">
              <Phone className="w-6 h-6 text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted/50">No calls have been made for this claim yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ERROR MODAL                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Modal open={errorModalOpen} onClose={() => setErrorModalOpen(false)} title="Call Failed">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <XCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-900 font-medium mb-1">Unable to initiate call</p>
              <p className="text-xs text-gray-500 font-data leading-relaxed">{callError}</p>
            </div>
          </div>
          <p className="text-xs text-muted">
            This could be due to a configuration issue with the voice service or a network error.
            Check that your ElevenLabs and Twilio credentials are configured correctly in Settings.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setErrorModalOpen(false)}
              className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                setErrorModalOpen(false);
                setCallState('idle');
                setCallError(null);
              }}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
