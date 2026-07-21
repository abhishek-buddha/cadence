import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  ArrowLeft,
  Phone,
  User,
  Building2,
  Stethoscope,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Smile,
  ShieldCheck,
  History,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import LiveCallMonitor from '../components/LiveCallMonitor';
import EvResultsCard from '../components/EvResultsCard';

// ---------------------------------------------------------------------------
// Shimmer placeholders (mirrors ClaimDetailPage)
// ---------------------------------------------------------------------------
function Shimmer({ className = '' }) {
  return <div className={`animate-pulse rounded bg-surface ${className}`} />;
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
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-4">
        <Shimmer className="h-9 w-9 rounded-lg" />
        <Shimmer className="h-6 w-48" />
        <Shimmer className="h-6 w-24 rounded-full" />
      </div>
      <div className="bg-white border border-border rounded-xl p-8 flex justify-center">
        <Shimmer className="h-14 w-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
      </div>
      <ShimmerCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable info field
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

function DetailCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-display font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past EV calls timeline entry (mirrors ClaimDetail's CallTimelineEntry)
// ---------------------------------------------------------------------------
function EvCallTimelineEntry({ call, result }) {
  const [expanded, setExpanded] = useState(false);

  const startDate = call.startedAt ? new Date(call.startedAt) : null;
  const formattedDate = startDate
    ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '--';
  const formattedTime = startDate
    ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  const durationStr = call.duration
    ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`
    : '--';

  return (
    <div className="relative pl-8 pb-6 last:pb-0 group">
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border group-last:hidden" />
      <div
        className={`absolute left-1 top-1.5 w-[14px] h-[14px] rounded-full border-2 ${
          call.status === 'completed'
            ? 'border-success bg-success/20'
            : call.status === 'failed'
              ? 'border-danger bg-danger/20'
              : 'border-accent bg-accent/20'
        }`}
      />

      <div className="bg-white border border-border rounded-lg overflow-hidden shadow-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-900 font-medium">{formattedDate}</span>
            <span className="text-xs text-muted font-data">{formattedTime}</span>
            <StatusBadge status={call.status} />
            <span className="text-xs text-muted font-data">
              <Clock className="w-3 h-3 inline mr-1" />
              {durationStr}
            </span>
            {result?.isActive != null && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  result.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                }`}
              >
                {result.isActive ? 'Coverage Active' : 'Coverage Inactive'}
              </span>
            )}
          </div>
          {(call.transcript || result) && (
            expanded ? <ChevronUp className="w-4 h-4 text-muted shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-border px-4 py-3 space-y-3">
            {result && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {result.deductibleAnnualCents != null && (
                  <div>
                    <p className="text-muted uppercase tracking-wider font-medium">Deductible</p>
                    <p className="font-data text-gray-900">
                      ${((result.deductibleMetCents || 0) / 100).toFixed(2)} / ${(result.deductibleAnnualCents / 100).toFixed(2)}
                    </p>
                  </div>
                )}
                {result.annualMaximumCents != null && (
                  <div>
                    <p className="text-muted uppercase tracking-wider font-medium">Annual Max</p>
                    <p className="font-data text-gray-900">
                      ${((result.annualMaximumCents - (result.annualMaxRemainingCents ?? result.annualMaximumCents)) / 100).toFixed(2)} / ${(result.annualMaximumCents / 100).toFixed(2)}
                    </p>
                  </div>
                )}
                {result.coinsurancePct != null && (
                  <div>
                    <p className="text-muted uppercase tracking-wider font-medium">Coinsurance</p>
                    <p className="font-data text-gray-900">{result.coinsurancePct}%</p>
                  </div>
                )}
                {result.repName && (
                  <div>
                    <p className="text-muted uppercase tracking-wider font-medium">Rep</p>
                    <p className="text-gray-900">{result.repName}</p>
                  </div>
                )}
                {result.referenceNumber && (
                  <div>
                    <p className="text-muted uppercase tracking-wider font-medium">Reference #</p>
                    <p className="font-data text-gray-900">{result.referenceNumber}</p>
                  </div>
                )}
              </div>
            )}

            {call.transcript && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">Transcript</p>
                <pre className="text-xs text-gray-600 font-data whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed bg-surface rounded-lg p-3 border border-border">
                  {call.transcript}
                </pre>
              </div>
            )}

            {call.errorMessage && (
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <p className="text-xs text-danger font-data">{call.errorMessage}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function EvCaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const data = useQuery(api.dentalCases?.getWithDetails, id ? { id } : 'skip');
  const initiateEvCall = useAction(api.dentalCallActions?.initiateEvCall);

  const [callState, setCallState] = useState('idle');
  const [callError, setCallError] = useState(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [localCompletedCallIds, setLocalCompletedCallIds] = useState(new Set());

  const handleCallComplete = (callId) => {
    setLocalCompletedCallIds((prev) => {
      const next = new Set(prev);
      next.add(callId);
      return next;
    });
  };

  if (data === undefined) {
    return <LoadingSkeleton />;
  }

  if (data === null || !data?.case) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="bg-white border border-border rounded-xl p-10 text-center max-w-md shadow-sm">
          <div className="w-14 h-14 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-7 h-7 text-danger" />
          </div>
          <h2 className="font-display font-bold text-xl text-gray-900 mb-2">Case Not Found</h2>
          <p className="text-sm text-muted mb-6">
            The eligibility case you are looking for does not exist or you do not have access to it.
          </p>
          <button
            onClick={() => navigate('/eligibility')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Eligibility
          </button>
        </div>
      </div>
    );
  }

  const dentalCase = data.case;
  const { patient, plan, insurance, provider, calls, evResults } = data;

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleRunEvCall = async () => {
    if (callState === 'calling' || callState === 'in_progress') return;
    setCallState('calling');
    setCallError(null);
    try {
      await initiateEvCall({ dentalCaseId: id });
      setCallState('idle');
    } catch (err) {
      setCallState('error');
      setCallError(err.message || 'Failed to start eligibility verification call.');
      setErrorModalOpen(true);
    }
  };

  const isCallStale = (call) => {
    if (!call?.startedAt) return false;
    return Date.now() - new Date(call.startedAt).getTime() > 30 * 60 * 1000;
  };

  const isRecentlyCompleted = (call) => {
    if (call?.status !== 'completed' || !call?.completedAt) return false;
    return Date.now() - new Date(call.completedAt).getTime() < 30000;
  };

  const isLocallyDone = (c) => localCompletedCallIds.has(c._id);

  const activeCall =
    calls?.find(
      (c) => ['initiating', 'ringing', 'in_progress'].includes(c.status) && !isCallStale(c) && !isLocallyDone(c)
    ) || calls?.find((c) => isRecentlyCompleted(c) && !isLocallyDone(c));

  const hasActiveCall =
    callState === 'calling' || callState === 'in_progress' || !!activeCall;

  // Allow retry for all non-verified statuses — including 'verifying' which can get
  // stuck if a call completes but the webhook never fires (e.g. wrong webhook URL).
  const canRunCall = !['verified', 'in_progress'].includes(dentalCase.status);

  // Build a map: callId -> evResult (oldest result corresponds to latestEvResult.callId, but
  // backend can return many)
  const evResultByCallId = {};
  (evResults ?? []).forEach((r) => {
    if (r.callId) evResultByCallId[r.callId] = r;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => navigate('/eligibility')}
          className="p-2 rounded-lg bg-white border border-border hover:border-border-light text-muted hover:text-gray-900 transition-all shadow-sm"
          aria-label="Back to eligibility"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-data text-xl text-gray-900 tracking-tight">
            {dentalCase.caseNumber || dentalCase._id?.slice(-6).toUpperCase()}
          </h1>
          <StatusBadge status={dentalCase.status || 'unknown'} size="lg" />
        </div>
        {dentalCase.proposedDateOfService && (
          <span className="ml-auto text-xs font-data text-muted bg-surface px-3 py-1 rounded-full border border-border">
            <CalendarDays className="w-3 h-3 inline mr-1.5" />
            DOS: {formatDate(dentalCase.proposedDateOfService)}
          </span>
        )}
      </div>

      {/* Hero: Run EV Call button or LiveCallMonitor */}
      {activeCall ? (
        <LiveCallMonitor call={activeCall} insurance={insurance} onComplete={handleCallComplete} />
      ) : (
        <div className="bg-gradient-to-r from-accent/5 to-cyan/5 border border-accent/15 rounded-xl p-8 text-center glow-border-strong">
          {insurance && (
            <p className="text-sm text-muted mb-4">
              <Building2 className="w-4 h-4 inline mr-1.5 text-accent/60" />
              {insurance.name}
              {insurance.phone && (
                <span className="font-data ml-2 text-muted/70">{insurance.phone}</span>
              )}
            </p>
          )}

          {canRunCall ? (
            <button
              onClick={handleRunEvCall}
              disabled={callState === 'calling' || callState === 'in_progress' || hasActiveCall}
              className={`relative inline-flex items-center gap-3 px-8 py-4 text-white font-display font-semibold text-lg rounded-xl transition-all duration-200
                ${callState === 'calling'
                  ? 'bg-accent/80 cursor-wait pulse-ring shadow-lg shadow-accent/20'
                  : callState === 'in_progress' || hasActiveCall
                    ? 'bg-accent/60 cursor-default'
                    : 'bg-accent hover:bg-accent-hover shadow-lg shadow-accent/15 hover:shadow-accent/30 hover:scale-[1.02] active:scale-[0.98]'
                }
                disabled:opacity-70`}
            >
              <Phone className={`w-5 h-5 ${callState === 'calling' ? 'animate-pulse' : ''}`} />
              {callState === 'calling' ? (
                <>Calling {insurance?.name || 'Payer'}...</>
              ) : callState === 'in_progress' || hasActiveCall ? (
                <>
                  <span className="status-dot-pulse w-2 h-2 rounded-full bg-success inline-block" />
                  Call in Progress
                </>
              ) : (
                <>Run EV Call</>
              )}
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-muted bg-white/60 border border-border rounded-lg px-4 py-2.5">
              <ShieldCheck className="w-4 h-4 text-success" />
              {dentalCase.status === 'verified'
                ? 'Eligibility already verified.'
                : `Status "${dentalCase.status}" — no further EV call needed.`}
            </div>
          )}

          {callState === 'error' && (
            <p className="mt-4 text-sm text-danger flex items-center justify-center gap-1.5">
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
        </div>
      )}

      {/* Case + Patient + Plan + Payer + Provider (2x grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-children">
        <DetailCard icon={Smile} title="Case Summary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Case #" value={dentalCase.caseNumber} mono />
            <InfoField label="Status" value={(dentalCase.status || 'unknown').replace(/_/g, ' ')} />
            <InfoField label="DOS" value={formatDate(dentalCase.proposedDateOfService)} />
            <InfoField label="Created" value={formatDate(dentalCase.createdAt || dentalCase._creationTime)} />
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">CDT Codes</p>
            <div className="flex flex-wrap gap-1.5">
              {(dentalCase.cdtCodes || []).length === 0 ? (
                <span className="text-sm text-muted/60 italic">--</span>
              ) : (
                (dentalCase.cdtCodes || []).map((code) => (
                  <span
                    key={code}
                    className="inline-flex px-2 py-0.5 bg-accent/10 text-accent text-xs rounded font-data"
                  >
                    {code}
                  </span>
                ))
              )}
            </div>
          </div>
          {dentalCase.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <InfoField label="Notes" value={dentalCase.notes} />
            </div>
          )}
        </DetailCard>

        <DetailCard icon={User} title="Patient">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Full Name" value={patient ? `${patient.firstName} ${patient.lastName}` : '--'} />
            <InfoField label="Date of Birth" value={patient?.dateOfBirth} />
            <InfoField label="Member ID" value={patient?.memberId} mono />
            <InfoField label="Group #" value={patient?.groupNumber} mono />
            <InfoField label="Subscriber" value={patient?.subscriberName} />
            <InfoField label="Relationship" value={patient?.relationship} />
          </div>
        </DetailCard>

        <DetailCard icon={ShieldCheck} title="Dental Plan">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Plan Name" value={plan?.name} />
            <InfoField label="Plan Code" value={plan?.planCode} mono />
            <InfoField label="Plan Type" value={plan?.planType} />
            <InfoField label="Effective Date" value={formatDate(plan?.effectiveDate)} />
          </div>
        </DetailCard>

        <DetailCard icon={Building2} title="Payer">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Company" value={insurance?.name} />
            <InfoField label="Phone" value={insurance?.phone} mono />
            <InfoField label="Payer ID" value={insurance?.payerId} mono />
          </div>
        </DetailCard>

        <DetailCard icon={Stethoscope} title="Provider">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Practice Name" value={provider?.practiceName} />
            <InfoField label="NPI" value={provider?.npi} mono />
            <InfoField label="Tax ID" value={provider?.taxId} mono />
            <InfoField label="Phone" value={provider?.phone} mono />
          </div>
        </DetailCard>
      </div>

      {/* Latest EV Result */}
      <EvResultsCard result={data?.latestResult ?? null} />

      {/* EV history timeline */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-display font-semibold text-gray-900">EV Call History</h3>
          </div>
          {calls && calls.length > 0 && (
            <span className="text-xs font-data text-muted">
              {calls.length} call{calls.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="px-5 py-5">
          {calls && calls.length > 0 ? (
            <div>
              {calls.map((call) => (
                <EvCallTimelineEntry
                  key={call._id}
                  call={call}
                  result={evResultByCallId[call._id]}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Phone className="w-6 h-6 text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted/50">No EV calls have been made for this case yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Error modal */}
      <Modal open={errorModalOpen} onClose={() => setErrorModalOpen(false)} title="Call Failed">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <XCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-900 font-medium mb-1">Unable to start EV call</p>
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
