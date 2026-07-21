import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PhoneCall, ChevronDown, ChevronRight, Clock, FileText, Mic, Search, Download, MessageSquare } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import OutcomeBadge from '../components/OutcomeBadge';
import EmptyState from '../components/EmptyState';
import DispositionBadge from '../components/DispositionBadge';
import { useProviderFilter } from '../context/ProviderFilterContext';

const OUTCOME_OPTIONS = [
  { value: 'successful', label: 'Successful' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
  { value: 'transferred_to_human', label: 'Transferred' },
];

const HUMAN_HANDOFF_UPDATE = 'Spoke to insurance human rep and clarified details.';


function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename, headers, rows) {
  const csvText = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function transcriptHaystack(call) {
  return [
    call?.transcript,
    call?.humanTranscript,
    call?.outcomeReason,
    call?.errorMessage,
    call?.claimNumber,
    call?.dentalCaseNumber,
    call?.insuranceCompany,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function connectedHumanHandoff(call) {
  return (
    call?.handoffState === 'connected' ||
    call?.handoffState === 'handoff_ended' ||
    !!call?.humanTranscript
  );
}

function displayOutcome(call) {
  if (call?.outcome) return call.outcome;
  return connectedHumanHandoff(call) ? 'transferred_to_human' : call?.outcome;
}

function formatDuration(seconds) {
  if (seconds == null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function callDuration(call) {
  if (call.duration != null && call.duration > 0) return call.duration;
  if (call.startedAt && call.completedAt) {
    return Math.max(0, Math.round((new Date(call.completedAt).getTime() - new Date(call.startedAt).getTime()) / 1000));
  }
  return null;
}

function convexSiteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const cloud = import.meta.env.VITE_CONVEX_URL || '';
  return cloud.replace('.convex.cloud', '.convex.site').replace(/\/$/, '');
}

function recordingPlaybackUrl(callId) {
  return `${convexSiteUrl()}/twilio-recording-media?callId=${encodeURIComponent(callId)}`;
}

function aiRecordingPlaybackUrl(callId) {
  return `${convexSiteUrl()}/elevenlabs-recording-media?callId=${encodeURIComponent(callId)}`;
}

function formatDate(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}


function titleCase(value) {
  if (!value) return '--';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  return value;
}

function inferCallbackRequested(result, call) {
  const text = [
    result?.nextSteps,
    result?.rawExtraction,
    call?.transcript,
    call?.humanTranscript,
    call?.outcomeReason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (result?.expectedDecisionDate) return 'Yes';
  if (/call\s*back|callback|follow\s*up|call again|try again|later/.test(text)) return 'Yes';
  return 'No';
}

function inferSentiment(result, call) {
  const text = [result?.rawExtraction, result?.nextSteps, call?.transcript, call?.humanTranscript]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/angry|frustrated|upset|complaint|escalat/.test(text)) return 'Negative';
  if (/thank|resolved|confirmed|approved|paid|completed/.test(text)) return 'Positive';
  return 'Neutral';
}

function FieldTile({ label, value, tone = 'default' }) {
  const toneClass = {
    default: 'text-gray-900',
    success: 'text-success',
    warn: 'text-warn',
    danger: 'text-danger',
    accent: 'text-accent',
  }[tone] || 'text-gray-900';

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 min-w-0">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted/70 font-semibold truncate">{label}</p>
      <p className={`mt-1 text-sm font-medium font-data truncate ${toneClass}`} title={String(fieldValue(value))}>
        {fieldValue(value)}
      </p>
    </div>
  );
}

function AuditExtractedFields({ call, result, isDentalCall, humanHandoffCompleted }) {
  if (!result && !humanHandoffCompleted) return null;

  const callbackRequested = inferCallbackRequested(result, call);
  const sentiment = inferSentiment(result, call);
  const referenceNumber = result?.referenceNumber || (!isDentalCall ? call?.referenceNumber : null);
  const denialCode = !isDentalCall ? result?.denialCode || call?.denialCode : null;
  const claimStatus = isDentalCall
    ? result?.isActive == null
      ? call?.outcome
      : result.isActive
        ? 'Coverage active'
        : 'Coverage inactive'
    : result?.claimStatus || call?.outcome;
  const confidence = result?.confidence != null ? `${Math.round(result.confidence * 100)}%` : null;

  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
        Extracted Fields
      </h4>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <FieldTile label={isDentalCall ? 'EV Status' : 'Claim Status'} value={titleCase(claimStatus)} tone="accent" />
        <FieldTile label="Reference #" value={referenceNumber} />
        <FieldTile label="Denial Code" value={denialCode || '--'} tone={denialCode ? 'danger' : 'default'} />
        <FieldTile label="Callback Requested" value={callbackRequested} tone={callbackRequested === 'Yes' ? 'warn' : 'success'} />
        <FieldTile label="Sentiment" value={sentiment} tone={sentiment === 'Negative' ? 'danger' : sentiment === 'Positive' ? 'success' : 'default'} />
        <FieldTile label="Rep Name" value={result?.repName} />
        <FieldTile label="Confidence" value={confidence} tone="accent" />
        <FieldTile label="Next Step Date" value={result?.expectedDecisionDate || result?.appealDeadline} />
      </div>
      {(result?.nextSteps || result?.denialReason || result?.rawExtraction || humanHandoffCompleted) && (
        <div className="mt-2 rounded-lg border border-border bg-white p-3 text-sm text-gray-700">
          {result?.denialReason && (
            <p><span className="font-medium text-gray-900">Denial reason:</span> {result.denialReason}</p>
          )}
          {result?.nextSteps && (
            <p className={result?.denialReason ? 'mt-1' : ''}>
              <span className="font-medium text-gray-900">Next steps:</span> {result.nextSteps}
            </p>
          )}
          {!result?.nextSteps && humanHandoffCompleted && (
            <p><span className="font-medium text-gray-900">Next steps:</span> {HUMAN_HANDOFF_UPDATE}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CallRow({ call, isLatestHandoffCall }) {
  const [expanded, setExpanded] = useState(false);
  const persistedDuration = callDuration(call);
  const humanHandoffCompleted = connectedHumanHandoff(call);

  const isDentalCall = !!call.dentalCaseId && !call.claimId;

  // Fetch related data only when expanded — guard claimId/dentalCaseId to avoid Convex validation errors
  const claim = useQuery(api.claims.getById, (expanded && call.claimId) ? { id: call.claimId } : 'skip');
  const dentalCase = useQuery(api.dentalCases?.getById, (expanded && call.dentalCaseId) ? { id: call.dentalCaseId } : 'skip');
  const insurance = useQuery(
    api.insuranceContacts.getById,
    expanded ? { id: call.insuranceContactId } : 'skip'
  );
  const callResult = useQuery(api.callResults.getByCall, (expanded && !isDentalCall) ? { callId: call._id } : 'skip');
  const evResult = useQuery(api.evResults?.getByCall, (expanded && isDentalCall) ? { callId: call._id } : 'skip');
  // Stored-audio playback URLs (Convex file storage) for both recording legs.
  const recordingUrls = useQuery(api.calls.getRecordingUrls, expanded ? { callId: call._id } : 'skip');

  // For the table row — safe guards so undefined IDs never reach Convex
  const claimPreview = useQuery(api.claims.getById, call.claimId ? { id: call.claimId } : 'skip');
  const dentalCasePreview = useQuery(api.dentalCases?.getById, (call.dentalCaseId && !call.claimId) ? { id: call.dentalCaseId } : 'skip');
  const insurancePreview = useQuery(api.insuranceContacts.getById, call.insuranceContactId ? { id: call.insuranceContactId } : 'skip');

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50/80 transition-colors text-left"
      >
        <span className="text-muted">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="px-4 py-3 text-sm text-gray-600 min-w-[160px]">
          {formatDate(call.startedAt)}
        </span>
        <span className="px-4 py-3 text-sm font-data text-accent min-w-[120px]">
          {claimPreview?.claimNumber ?? dentalCasePreview?.caseNumber ?? (call.claimId || call.dentalCaseId ? '...' : '--')}
        </span>
        <span className="px-4 py-3 text-sm text-gray-600 flex-1 truncate">
          {insurancePreview?.name ?? '...'}
        </span>
        <span className="min-w-[140px] flex justify-start">
          <OutcomeBadge outcome={displayOutcome(call)} missingFields={call.missingFields} />
        </span>
        <span className="px-4 py-3 text-sm font-data text-gray-600 min-w-[70px] text-right">
          {formatDuration(persistedDuration)}
        </span>
        <span className="min-w-[90px] flex justify-center">
          {(call.recordingUrl || call.elevenLabsConversationId) ? (
            <span className="inline-flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              <Mic className="w-3 h-3" />
              Recording
            </span>
          ) : (
            <span className="text-xs text-muted/40">--</span>
          )}
        </span>
        <span className="min-w-[110px] flex justify-end">
          <StatusBadge status={call.status} />
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pl-12 animate-fade-in">
          <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
            {/* Claim and Insurance Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1">
                  {isDentalCall ? 'EV Case' : 'Claim'}
                </h4>
                <p className="text-sm text-gray-900 font-data">
                  {isDentalCall ? (dentalCase?.caseNumber ?? '--') : (claim?.claimNumber ?? '--')}
                </p>
                {!isDentalCall && claim && (
                  <p className="text-xs text-muted mt-0.5">
                    DOS: {claim.dateOfService} | Status: {claim.status}
                  </p>
                )}
                {isDentalCall && dentalCase && (
                  <p className="text-xs text-muted mt-0.5">
                    DOS: {dentalCase.proposedDateOfService} | Status: {dentalCase.status}
                  </p>
                )}
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1">Insurance</h4>
                <p className="text-sm text-gray-900">{insurance?.name ?? '--'}</p>
                {insurance?.phone && (
                  <p className="text-xs text-muted font-data mt-0.5">{insurance.phone}</p>
                )}
              </div>
            </div>

            {/* Transcript */}
            {humanHandoffCompleted && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
                  Latest Update
                </h4>
                <div className="bg-white border border-border rounded-lg p-3">
                  <p className="text-sm text-gray-700">{HUMAN_HANDOFF_UPDATE}</p>
                </div>
              </div>
            )}

            <AuditExtractedFields
              call={call}
              result={isDentalCall ? evResult : callResult}
              isDentalCall={isDentalCall}
              humanHandoffCompleted={humanHandoffCompleted}
            />

            {/* AI/IVR Recording — the ElevenLabs agent↔IVR leg, stored in our
                own file storage (falls back to the on-demand proxy if the
                bytes aren't stored yet). */}
            {(recordingUrls?.aiUrl || call.elevenLabsConversationId) && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  AI/IVR Recording
                </h4>
                <audio
                  controls
                  preload="metadata"
                  src={recordingUrls?.aiUrl || aiRecordingPlaybackUrl(call._id)}
                  className="h-9 w-full max-w-md"
                />
              </div>
            )}

            {/* Human Agent Recording — the Twilio human↔human conference leg,
                stored in our own file storage (falls back to the proxy). */}
            {(recordingUrls?.humanUrl || call.recordingUrl) && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  Human Agent Recording
                  {persistedDuration != null && (
                    <span className="font-data text-muted normal-case tracking-normal">
                      {formatDuration(persistedDuration)}
                    </span>
                  )}
                </h4>
                <audio
                  controls
                  preload="metadata"
                  src={recordingUrls?.humanUrl || recordingPlaybackUrl(call._id)}
                  className="h-9 w-full max-w-md"
                />
              </div>
            )}

            {/* AI/IVR Transcript */}
            {call.transcript && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  AI/IVR Transcript
                </h4>
                <div className="bg-white border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                    {call.transcript}
                  </p>
                </div>
              </div>
            )}

            {/* Human Agent Transcript — Twilio's transcription of the conference recording */}
            {call.humanTranscript && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  Human Agent Transcript
                </h4>
                <div className="bg-white border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                    {call.humanTranscript}
                  </p>
                </div>
              </div>
            )}

            {/* Operator Notes — disposition + comment recorded via the
                operator's post-call workspace (convex/claimFollowups.ts). The
                note lives on the CLAIM, not the call, and one claim can have
                many calls (retries) — only attribute it to the most recent
                handoff call for that claim, not every one. */}
            {!isDentalCall && claim && isLatestHandoffCall && (claim.followUpComment || claim.followUpDisposition) && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />
                  Operator Notes
                </h4>
                <div className="bg-white border border-border rounded-lg p-3 space-y-2">
                  {claim.followUpDisposition && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <DispositionBadge disposition={claim.followUpDisposition} />
                      {(claim.followUpBy || claim.followUpAt) && (
                        <span className="text-xs text-muted">
                          {claim.followUpBy ? `by ${claim.followUpBy}` : ''}
                          {claim.followUpBy && claim.followUpAt ? ' · ' : ''}
                          {claim.followUpAt ? formatDate(claim.followUpAt) : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {claim.followUpComment && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {claim.followUpComment}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Extracted Results */}
            {callResult && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
                  Extracted Results
                </h4>
                <div className="bg-white border border-border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {callResult.claimStatus && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Claim Status</span>
                        <span className="text-xs text-gray-900 font-medium">{callResult.claimStatus}</span>
                      </div>
                    )}
                    {callResult.paidAmount != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Paid Amount</span>
                        <span className="text-xs text-success font-data">
                          ${(callResult.paidAmount / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {callResult.paidDate && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Paid Date</span>
                        <span className="text-xs text-gray-900 font-data">{callResult.paidDate}</span>
                      </div>
                    )}
                    {callResult.referenceNumber && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Reference #</span>
                        <span className="text-xs text-gray-900 font-data">{callResult.referenceNumber}</span>
                      </div>
                    )}
                    {callResult.repName && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Rep Name</span>
                        <span className="text-xs text-gray-900">{callResult.repName}</span>
                      </div>
                    )}
                    {callResult.denialCode && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Denial Code</span>
                        <span className="text-xs text-danger font-data">{callResult.denialCode}</span>
                      </div>
                    )}
                    {callResult.denialReason && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Denial Reason</span>
                        <span className="text-xs text-gray-600 text-right max-w-[60%]">{callResult.denialReason}</span>
                      </div>
                    )}
                    {callResult.nextSteps && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Next Steps</span>
                        <span className="text-xs text-gray-600 text-right max-w-[60%]">{callResult.nextSteps}</span>
                      </div>
                    )}
                    {callResult.confidence != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Confidence</span>
                        <span className="text-xs text-accent font-data">{Math.round(callResult.confidence * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* EV Results (dental calls) */}
            {isDentalCall && evResult && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted font-medium mb-1.5">EV Results</h4>
                <div className="bg-white border border-border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {evResult.isActive != null && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Coverage</span>
                        <span className={`text-xs font-medium ${evResult.isActive ? 'text-success' : 'text-danger'}`}>
                          {evResult.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    )}
                    {evResult.deductibleAnnualCents != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Deductible</span>
                        <span className="text-xs text-gray-900 font-data">
                          ${((evResult.deductibleMetCents || 0) / 100).toFixed(0)} / ${(evResult.deductibleAnnualCents / 100).toFixed(0)}
                        </span>
                      </div>
                    )}
                    {evResult.annualMaximumCents != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Annual Max</span>
                        <span className="text-xs text-gray-900 font-data">${(evResult.annualMaximumCents / 100).toFixed(0)}</span>
                      </div>
                    )}
                    {evResult.coinsurancePct != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Coinsurance</span>
                        <span className="text-xs text-gray-900 font-data">{evResult.coinsurancePct}%</span>
                      </div>
                    )}
                    {evResult.networkStatus && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Network</span>
                        <span className="text-xs text-gray-900">{evResult.networkStatus.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    {evResult.referenceNumber && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted">Reference #</span>
                        <span className="text-xs text-gray-900 font-data">{evResult.referenceNumber}</span>
                      </div>
                    )}
                    {evResult.nextSteps && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-xs text-muted">Next Steps</span>
                        <span className="text-xs text-gray-600 text-right max-w-[60%]">{evResult.nextSteps}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* No transcript or results */}
            {!call.transcript && !call.humanTranscript && !callResult && !evResult &&
              !(isLatestHandoffCall && (claim?.followUpComment || claim?.followUpDisposition)) && (
                <p className="text-sm text-muted italic">No transcript or extracted data available for this call.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CallHistory() {
  const { selectedProviderId } = useProviderFilter();
  const allCalls = useQuery(api.calls.listRecent, { limit: 50 });
  const allClaims = useQuery(api.claims.list);
  const [statusFilter, setStatusFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState([]); // empty = all
  const [outcomeMenuOpen, setOutcomeMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isLoading = allCalls === undefined;

  // Build set of claim IDs belonging to the selected provider
  const providerClaimIds = selectedProviderId && allClaims
    ? new Set(allClaims.filter((c) => c.providerId === selectedProviderId).map((c) => c._id))
    : null;

  // Filter calls by provider (through claims) and status
  const calls = selectedProviderId
    ? (allCalls ?? []).filter((c) => providerClaimIds?.has(c.claimId))
    : allCalls;

  // A claim's operator note (disposition/comment) lives on the claim, not the
  // call, and one claim can have many calls (retries) — this maps each claim
  // to its single most-recent handoff call, so the note attributes to exactly
  // one row instead of duplicating across every historical attempt. Built
  // from the full (pre status/outcome/search filter) list, already
  // newest-first, so it stays stable regardless of which rows are filtered in.
  const latestHandoffCallIdByClaim = new Map();
  (calls ?? []).forEach((c) => {
    if (c.handoffState && c.claimId && !latestHandoffCallIdByClaim.has(c.claimId)) {
      latestHandoffCallIdByClaim.set(c.claimId, c._id);
    }
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCalls = calls
    ? calls
        .filter((c) => statusFilter === 'all' || c.status === statusFilter)
        .filter((c) => outcomeFilter.length === 0 || outcomeFilter.includes(displayOutcome(c)))
        .filter((c) => !normalizedSearch || transcriptHaystack(c).includes(normalizedSearch))
    : [];

  function exportFilteredCalls() {
    downloadCsv(
      `cadence-call-history-${new Date().toISOString().split('T')[0]}.csv`,
      ['Date', 'Claim/Case', 'Insurance', 'Outcome', 'Duration', 'Status', 'Transcript Preview'],
      filteredCalls.map((call) => [
        formatDate(call.startedAt),
        call.claimNumber || call.dentalCaseNumber || '--',
        call.insuranceCompany || '--',
        displayOutcome(call) || '--',
        formatDuration(callDuration(call)),
        call.status || '--',
        (call.humanTranscript || call.transcript || '').slice(0, 300),
      ])
    );
  }

  const toggleOutcome = (value) => {
    setOutcomeFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const inputClass =
    'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Call History</h1>
          <p className="text-sm text-muted mt-1">All voice agent calls</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search transcripts..."
              className={`${inputClass} pl-8 w-56`}
            />
          </div>
          <button
            type="button"
            onClick={exportFilteredCalls}
            disabled={filteredCalls.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-gray-600 hover:border-accent hover:text-accent disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <Clock className="w-4 h-4 text-muted" />
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${inputClass} custom-select appearance-none pr-8 w-44 cursor-pointer`}
            >
              <option value="all">All Statuses</option>
              <option value="initiating">Initiating</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOutcomeMenuOpen((o) => !o)}
              className={`${inputClass} appearance-none pr-8 w-48 cursor-pointer text-left`}
            >
              {outcomeFilter.length === 0
                ? 'All Outcomes'
                : `${outcomeFilter.length} selected`}
            </button>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            {outcomeMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-border rounded-lg shadow-lg z-10 p-2">
                {OUTCOME_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={outcomeFilter.includes(opt.value)}
                      onChange={() => toggleOutcome(opt.value)}
                      className="rounded border-border-light text-accent focus:ring-accent"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
                {outcomeFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOutcomeFilter([])}
                    className="w-full text-left px-2 py-1.5 mt-1 text-xs text-muted hover:text-gray-700 border-t border-border"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Call count summary */}
      {!isLoading && calls.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">
            Showing <span className="text-gray-900 font-medium">{filteredCalls.length}</span>
            {statusFilter !== 'all' && ` ${statusFilter}`} call{filteredCalls.length !== 1 ? 's' : ''}{normalizedSearch && ` matching "${searchTerm.trim()}"`}
            {statusFilter !== 'all' && (
              <span className="text-muted"> of {calls.length} total</span>
            )}
          </span>
        </div>
      )}

      {/* Call List */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-8 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          {calls.length === 0 ? (
            <EmptyState
              icon={PhoneCall}
              title="No calls yet"
              description="Call history will appear here once voice agents start making insurance follow-up calls."
            />
          ) : (
            <EmptyState
              icon={PhoneCall}
              title="No matching calls"
              description={`No calls found with status "${statusFilter}". Try a different filter.`}
              action={
                <button
                  onClick={() => setStatusFilter('all')}
                  className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors"
                >
                  Show All Calls
                </button>
              }
            />
          )}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-border">
            <span className="w-4" /> {/* Chevron spacer */}
            <span className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold min-w-[160px]">Date</span>
            <span className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold min-w-[120px]">Claim #</span>
            <span className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold flex-1">Insurance</span>
            <span className="min-w-[140px] text-left text-xs uppercase tracking-wider text-muted font-semibold">Outcome</span>
            <span className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold min-w-[70px]">Duration</span>
            <span className="min-w-[90px] text-center text-xs uppercase tracking-wider text-muted font-semibold">Recording</span>
            <span className="min-w-[110px] text-right text-xs uppercase tracking-wider text-muted font-semibold pr-4">Status</span>
          </div>

          {/* Call rows */}
          <div className="divide-y divide-border/30">
            {filteredCalls.map((call) => (
              <CallRow
                key={call._id}
                call={call}
                isLatestHandoffCall={latestHandoffCallIdByClaim.get(call.claimId) === call._id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
