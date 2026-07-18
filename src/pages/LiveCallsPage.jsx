// LiveCallsPage — /live
//
// The operator surface for the live AI→human handoff:
//   • Incoming Handoffs — insurance reps waiting for one of our agents. Any
//     active user sees these (broadcast); first to Accept wins. Accept joins
//     the Twilio conference via the browser softphone; Decline passes.
//   • Active Calls — every in-flight verification call + its handoff timeline.
//
// Reactive: driven by Convex subscriptions (api.handoff.listAwaitingHandoff /
// listLive), no polling.

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Radio,
  PhoneIncoming,
  Check,
  X,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import HandoffTimeline from '../components/HandoffTimeline';
import { useSoftphone } from '../hooks/useSoftphone';

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

// A single incoming-handoff card with Accept / Decline.
function IncomingCard({ call, softphone, onAccepted }) {
  const acceptHandoff = useMutation(api.handoff.acceptHandoff);
  const declineHandoff = useMutation(api.handoff.declineHandoff);
  const redirectPayer = useAction(api.handoff.redirectPayerToConference);
  const markConnected = useMutation(api.handoff.markConnectedFromClient);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [, forceTick] = useState(0);

  // Live-ticking elapsed timer.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleAccept() {
    setBusy(true);
    setNotice(null);
    // 1) Atomic first-wins claim.
    const res = await acceptHandoff({ callId: call._id });
    if (!res?.ok) {
      setNotice(res?.reason === 'already_taken' ? 'Already taken by another agent' : 'Could not accept');
      setBusy(false);
      return;
    }
    try {
      // 2) Join the conference from the browser FIRST. Do not redirect/drop the
      //    AI until Twilio confirms the Cadence user is actually connected.
      const joined = await softphone.connect(call._id);
      if (!joined?.ok) {
        setNotice(`Could not connect browser phone${joined?.error ? `: ${joined.error}` : ''}`);
        setBusy(false);
        return;
      }

      // 3) Drop the AI: redirect the payer leg into the same conference. This
      //    closes the AI's bridge stream. Payer now hears our human.
      const r = await redirectPayer({ callId: call._id });
      if (!r?.ok) {
        softphone.disconnect();
        setNotice(`Could not bridge the call${r?.error ? `: ${r.error}` : ''}`);
        setBusy(false);
        return;
      }
      // 4) Mark connected once both sides are in.
      await markConnected({ callId: call._id });
      onAccepted?.(call._id);
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
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <PhoneIncoming className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{call.insuranceCompany || 'Payer'}</p>
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Accept
          </button>
          <button
            onClick={handleDecline}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
            Decline
          </button>
        </div>
      </div>
      {notice && (
        <p className="mt-2 text-xs text-warn flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {notice}
        </p>
      )}
    </div>
  );
}

// One active call row + its handoff timeline.
function ActiveCallRow({ call }) {
  const detail = useQuery(api.handoff.getHandoff, { callId: call._id });
  const events = detail?.events ?? [];
  const c = detail?.call || call;

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{call.insuranceCompany || 'Payer'}</p>
          <p className="text-sm text-gray-600">
            {subjectLabel(call)}
            {call.patientName ? ` · ${call.patientName}` : ''}
          </p>
        </div>
        <StateBadge handoffState={call.handoffState} status={call.status} />
      </div>
      <HandoffTimeline call={c} events={events} />

      {/* Post-handoff recording + transcript of the human-human portion. */}
      {(c.recordingUrl || c.humanTranscript) && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
          {c.recordingUrl && (
            <div className="space-y-1.5 text-xs text-muted">
              <div className="flex items-center gap-2">
                <Mic className="w-3.5 h-3.5" />
                <span>Call recorded</span>
              </div>
              <audio
                controls
                preload="none"
                src={recordingPlaybackUrl(c._id)}
                className="h-9 w-full max-w-md"
              />
            </div>
          )}
          <div className="text-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted/70">
              Transcript
            </p>
            {c.humanTranscript ? (
              <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 text-[13px] leading-relaxed">
                {c.humanTranscript}
              </p>
            ) : (
              <p className="text-xs text-muted bg-gray-50 rounded-lg p-3">
                Transcript processing. It will appear here when Twilio finishes transcription.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StateBadge({ handoffState, status }) {
  const map = {
    awaiting_human: { label: 'Awaiting agent', cls: 'bg-accent/10 text-accent' },
    accepting: { label: 'Connecting', cls: 'bg-warn/10 text-warn' },
    connected: { label: 'Connected', cls: 'bg-success/10 text-success' },
    handoff_failed: { label: 'Handoff failed', cls: 'bg-danger/10 text-danger' },
    handoff_ended: { label: 'Ended', cls: 'bg-gray-100 text-gray-500' },
  };
  const cfg =
    (handoffState && map[handoffState]) ||
    (status === 'in_progress' || status === 'initiating'
      ? { label: 'AI on call', cls: 'bg-cyan/10 text-cyan' }
      : { label: status, cls: 'bg-gray-100 text-gray-500' });
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// Compact softphone status/control bar.
function SoftphoneBar({ softphone }) {
  const { status, error, activeCallId, muted, disconnect, toggleMute } = softphone;

  if (status === 'unconfigured') {
    return (
      <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-warn flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Browser calling not configured yet — set TWILIO_API_KEY, TWILIO_API_SECRET and
        TWILIO_TWIML_APP_SID in Convex env. Accept still routes the rep; audio connects once configured.
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

  return (
    <div className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-700">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        {muted ? (
          <MicOff className="w-4 h-4 text-warn" />
        ) : (
          <Mic className="w-4 h-4 text-gray-400" />
        )}
        <span className="font-medium">
          {status === 'on_call'
            ? `On call${muted ? ' - muted' : ''}${activeCallId ? '' : ''}`
            : status === 'connecting'
              ? 'Connecting…'
              : status === 'ready'
                ? 'Softphone ready'
                : status === 'error'
                  ? `Error: ${error || 'unknown'}`
                  : 'Softphone idle'}
        </span>
      </div>
      {(status === 'on_call' || status === 'connecting') && (
        <div className="flex items-center gap-2">
          {status === 'on_call' && (
            <button
              onClick={toggleMute}
              aria-pressed={muted}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                muted
                  ? 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/15'
                  : 'border-border text-gray-600 hover:bg-gray-50'
              }`}
            >
              {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-danger text-white text-xs font-medium hover:bg-danger/90 transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" /> Hang up
          </button>
        </div>
      )}
    </div>
  );
}

export default function LiveCallsPage() {
  const awaiting = useQuery(api.handoff.listAwaitingHandoff);
  const live = useQuery(api.handoff.listLive);
  const softphone = useSoftphone();

  // Warm up the device once so the first Accept connects fast (safe no-op if
  // unconfigured).
  useEffect(() => {
    softphone.ensureDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const awaitingList = awaiting ?? [];
  const liveList = live ?? [];
  const loading = awaiting === undefined || live === undefined;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Radio className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-gray-900">Live Calls</h1>
          <p className="text-sm text-muted">
            Take over insurance calls from the AI the moment a rep picks up.
          </p>
        </div>
      </div>

      <SoftphoneBar softphone={softphone} />

      {/* Incoming handoffs */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.15em] text-muted/70 font-semibold mb-3">
          Incoming Handoffs
        </h2>
        {loading ? (
          <div className="rounded-xl border border-border bg-white p-6 shimmer h-20" />
        ) : awaitingList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-gray-50/50 p-6 text-center text-sm text-muted">
            No calls waiting for handoff right now.
          </div>
        ) : (
          <div className="space-y-3">
            {awaitingList.map((call) => (
              <IncomingCard key={call._id} call={call} softphone={softphone} />
            ))}
          </div>
        )}
      </section>

      {/* Active calls */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.15em] text-muted/70 font-semibold mb-3">
          Active Calls
        </h2>
        {loading ? (
          <div className="rounded-xl border border-border bg-white p-6 shimmer h-24" />
        ) : liveList.length === 0 ? (
          <EmptyState
            icon={PhoneCall}
            title="No active calls"
            description="When a verification call is running, it appears here with its live handoff status."
          />
        ) : (
          <div className="space-y-3">
            {liveList.map((call) => (
              <ActiveCallRow key={call._id} call={call} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
