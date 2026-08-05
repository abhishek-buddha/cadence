// OperatorQueuePage — an operator's single-screen "waiting for a call" queue.
//
// Drives entirely off handoff.getMyRoutingStatus({ userId }), which is the
// same by_assignedAgentUserId + isRoutingCallActive lookup the admin's
// Claim User Routing table uses, scoped to just this operator. The
// accept/decline/connect orchestration below mirrors LiveCallsPage.jsx's
// IncomingCard exactly (acceptHandoff -> softphone.connect ->
// redirectPayerToConference -> markConnectedFromClient) — the underlying
// call mechanism is untouched, this is a different screen calling the same
// Convex functions.

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  PhoneIncoming,
  PhoneCall,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Radio,
  Mic,
  MicOff,
  PhoneOff,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import HandoffContextCard from '../components/HandoffContextCard';
import HandoffTimeline from '../components/HandoffTimeline';
import PostCallWorkspace from '../components/operator/PostCallWorkspace';
import { useSoftphone } from '../hooks/useSoftphone';
import { useAuth } from '../context/AuthContext';

function convexSiteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const cloud = import.meta.env.VITE_CONVEX_URL || '';
  return cloud.replace('.convex.cloud', '.convex.site').replace(/\/$/, '');
}

function recordingPlaybackUrl(callId) {
  return `${convexSiteUrl()}/twilio-recording-media?callId=${encodeURIComponent(callId)}`;
}

function elapsedSince(iso) {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function subjectLabel(call) {
  if (call.claimNumber) return `Claim ${call.claimNumber}`;
  if (call.dentalCaseNumber) return `Case ${call.dentalCaseNumber}`;
  return 'Verification call';
}

// ---------------------------------------------------------------------------
// Compact softphone status strip — shown on every state so the operator
// always knows whether their browser mic/audio is ready.
// ---------------------------------------------------------------------------
function SoftphoneStatus({ softphone }) {
  const { status, error } = softphone;
  if (status === 'unconfigured') {
    return (
      <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-warn flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Browser calling isn't configured yet — calls will still route to you, but audio won't connect until it is.
      </div>
    );
  }
  const dot =
    status === 'on_call'
      ? 'bg-success animate-pulse'
      : status === 'connecting'
        ? 'bg-warn animate-pulse'
        : status === 'ready'
          ? 'bg-success'
          : status === 'error'
            ? 'bg-danger'
            : 'bg-gray-300';
  const label =
    status === 'on_call'
      ? 'On call'
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'ready'
          ? 'Softphone ready'
          : status === 'error'
            ? `Error: ${error || 'unknown'}`
            : 'Preparing softphone…';
  return (
    <div className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: no assigned call — waiting
// ---------------------------------------------------------------------------
function WaitingPanel({ softphone }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6 animate-pulse">
        <Radio className="w-8 h-8 text-accent" />
      </div>
      <h1 className="text-xl font-display font-bold text-gray-900 mb-1.5">Waiting for a call</h1>
      <p className="text-sm text-muted max-w-sm mb-6">
        You're marked available. As soon as a payer call is handed off to you, it will show up here automatically.
      </p>
      <SoftphoneStatus softphone={softphone} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: awaiting_human — incoming, needs Accept/Decline
// ---------------------------------------------------------------------------
function IncomingCallPanel({ call, softphone }) {
  const acceptHandoff = useMutation(api.handoff.acceptHandoff);
  const declineHandoff = useMutation(api.handoff.declineHandoff);
  const redirectPayer = useAction(api.handoff.redirectPayerToConference);
  const markConnected = useMutation(api.handoff.markConnectedFromClient);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleAccept() {
    setBusy(true);
    setNotice(null);
    const res = await acceptHandoff({ callId: call._id, agentUserId: call.assignedAgentUserId });
    if (!res?.ok) {
      setNotice(res?.reason === 'already_taken' ? 'Already taken by another agent' : 'Could not accept');
      setBusy(false);
      return;
    }
    try {
      const joined = await softphone.connect(call._id);
      if (!joined?.ok) {
        setNotice(`Could not connect browser phone${joined?.error ? `: ${joined.error}` : ''}`);
        setBusy(false);
        return;
      }
      const routed = await redirectPayer({ callId: call._id });
      if (!routed?.ok) {
        softphone.disconnect();
        setNotice(`Could not bridge the call${routed?.error ? `: ${routed.error}` : ''}`);
        setBusy(false);
        return;
      }
      await markConnected({ callId: call._id });
    } catch (e) {
      setNotice(`Handoff error: ${e?.message || 'unknown'}`);
    }
    setBusy(false);
  }

  async function handleDecline() {
    setBusy(true);
    await declineHandoff({ callId: call._id });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
              <PhoneIncoming className="w-5 h-5 text-accent animate-pulse" />
            </div>
            <div>
              <p className="font-display font-semibold text-lg text-gray-900">{call.insuranceCompany || 'Payer'}</p>
              <p className="text-sm text-gray-600">
                {subjectLabel(call)}
                {call.patientName ? ` · ${call.patientName}` : ''}
              </p>
              <p className="text-[11px] text-muted mt-1 font-data">
                Waiting {elapsedSince(call.handoffRequestedAt)}
                {call.handoffReason ? ` · ${call.handoffReason}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Accept
            </button>
            <button
              onClick={handleDecline}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Decline
            </button>
          </div>
        </div>
        {notice && (
          <p className="mt-3 text-xs text-warn flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {notice}
          </p>
        )}
      </div>
      <HandoffContextCard call={call} />
      <SoftphoneStatus softphone={softphone} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: accepting / connected — on the call
// ---------------------------------------------------------------------------
function OnCallPanel({ call, softphone }) {
  const detail = useQuery(api.handoff.getHandoff, { callId: call._id });
  const events = detail?.events ?? [];
  const c = detail?.call || call;
  const { status, muted, disconnect, toggleMute } = softphone;
  const endCallAction = useAction(api.callActions.endCall);
  const endHandoff = useMutation(api.handoff.endHandoffFromClient);
  const [ending, setEnding] = useState(false);

  async function handleEndCall() {
    if (ending) return;
    setEnding(true);
    try {
      // Actually terminate the Twilio call (not just this browser's own leg)
      // and finalize the AI transcript/analysis, then flip handoffState so
      // the UI reflects "ended" instead of staying on "connected".
      await endCallAction({ callId: call._id });
      await endHandoff({ callId: call._id });
    } catch (e) {
      console.error('Failed to end call:', e);
    } finally {
      disconnect();
      setEnding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-3.5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-success">
          <PhoneCall className="w-4 h-4" />
          {status === 'on_call' ? 'On call' : status === 'connecting' ? 'Connecting…' : 'Bridging call'}
        </div>
        <div className="flex items-center gap-2">
          {status === 'on_call' && (
            <button
              onClick={toggleMute}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                muted
                  ? 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/15'
                  : 'border-border text-gray-600 hover:bg-gray-50'
              }`}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button
            onClick={handleEndCall}
            disabled={ending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition-colors"
          >
            {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
            {ending ? 'Ending…' : 'End Call'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">Call Progress</p>
        <HandoffTimeline call={c} events={events} />
      </div>

      <HandoffContextCard call={c} />

      {/* Claim grouping + disposition workspace — same-payer claims the operator
          can process while the payer rep is still on the line. */}
      <PostCallWorkspace call={c} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: handoff_ended / handoff_failed — wrap-up summary
// ---------------------------------------------------------------------------
function EndedPanel({ call }) {
  const ended = call.handoffState === 'handoff_ended';
  const completeWrapUp = useMutation(api.handoff.completeWrapUp);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    setError(null);
    try {
      const res = await completeWrapUp({ callId: call._id });
      if (!res?.ok) setError('Could not complete — please retry');
    } catch (e) {
      setError(e?.message || 'Could not complete');
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border px-5 py-4 flex items-center justify-between gap-3 flex-wrap ${
          ended ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'
        }`}
      >
        <div className="flex items-center gap-3">
          {ended ? (
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-danger shrink-0" />
          )}
          <div>
            <p className={`font-medium ${ended ? 'text-success' : 'text-danger'}`}>
              {ended ? 'Call ended' : 'Handoff failed'}
            </p>
            <p className="text-sm text-gray-600">
              {subjectLabel(call)}
              {call.patientName ? ` · ${call.patientName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleComplete}
            disabled={completing}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Complete Call
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">
        This call stays in your queue until you click Complete Call — finish setting next steps below first.
      </p>

      {(call.recordingUrl || call.humanTranscript) && (
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-3">
          {call.recordingUrl && (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted font-semibold">Recording</p>
              <audio controls preload="metadata" src={recordingPlaybackUrl(call._id)} className="h-9 w-full" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-1.5">Transcript</p>
            {call.humanTranscript ? (
              <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 text-[13px] leading-relaxed">
                {call.humanTranscript}
              </p>
            ) : (
              <p className="text-xs text-muted bg-gray-50 rounded-lg p-3">
                Transcript processing — it will appear here once Twilio finishes transcription.
              </p>
            )}
          </div>
        </div>
      )}

      <HandoffContextCard call={call} />

      {/* Post-call: set the disposition for the handed-off claim and process any
          other open claims for the same payer. */}
      <PostCallWorkspace call={call} />
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function OperatorQueuePage() {
  const auth = useAuth();
  const status = useQuery(api.handoff.getMyRoutingStatus, auth?.userId ? { userId: auth.userId } : 'skip');
  const softphone = useSoftphone();

  useEffect(() => {
    softphone.ensureDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-40 shimmer rounded-xl" />
      </div>
    );
  }

  const call = status?.activeCall;

  if (!call) return <WaitingPanel softphone={softphone} />;
  if (call.handoffState === 'awaiting_human') return <IncomingCallPanel call={call} softphone={softphone} />;
  if (call.handoffState === 'accepting' || call.handoffState === 'connected') {
    return <OnCallPanel call={call} softphone={softphone} />;
  }
  if (call.handoffState === 'handoff_ended' || call.handoffState === 'handoff_failed') {
    return <EndedPanel call={call} />;
  }
  return <WaitingPanel softphone={softphone} />;
}
