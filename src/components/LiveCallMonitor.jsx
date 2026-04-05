import { useState, useEffect, useRef, useMemo } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Phone, Clock, CheckCircle2, MessageSquare, Volume2, VolumeX, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Standard ITU-T G.711 mu-law decode table
// ---------------------------------------------------------------------------
const MULAW_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  let mulaw = ~i & 0xFF;
  const sign = mulaw & 0x80;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  let magnitude = ((2 * mantissa + 33) << exponent) - 33;
  MULAW_TABLE[i] = (sign ? -magnitude : magnitude) / 32768.0;
}

// ---------------------------------------------------------------------------
// Linear interpolation upsample from 8kHz to target rate (avoids browser
// resampling artifacts that cause static/crackling)
// ---------------------------------------------------------------------------
function upsample8kTo(samples8k, targetRate) {
  const ratio = targetRate / 8000;
  const out = new Float32Array(Math.ceil(samples8k.length * ratio));
  for (let i = 0; i < out.length; i++) {
    const srcIdx = i / ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, samples8k.length - 1);
    const frac = srcIdx - lo;
    out[i] = samples8k[lo] * (1 - frac) + samples8k[hi] * frac;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------
function useElapsedTimer(startIso, frozenDuration) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (frozenDuration != null) {
      setElapsed(frozenDuration);
      return;
    }
    if (!startIso) return;
    const start = new Date(startIso).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso, frozenDuration]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// LiveCallMonitor
// ---------------------------------------------------------------------------
export default function LiveCallMonitor({ call, insurance, onComplete }) {
  const getCallStatus = useAction(api.callActions.getCallStatus);
  const transcriptEndRef = useRef(null);
  const completionTriggeredRef = useRef(false);

  // Ref-based timer freeze — set synchronously when "done" detected
  const callDoneDurationRef = useRef(null);

  // Audio state
  const [muted, setMuted] = useState(true);
  const [audioConnected, setAudioConnected] = useState(false);
  const mutedRef = useRef(false);
  const audioCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const nextPlayTimeRef = useRef(0);
  const playIntervalRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Polling for call status + transcript
  const [polledData, setPolledData] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!call?.elevenLabsConversationId) return;
    let cancelled = false;

    const startDelay = setTimeout(async () => {
      if (cancelled) return;
      async function poll() {
        if (cancelled) return;
        try {
          const data = await getCallStatus({
            conversationId: call.elevenLabsConversationId,
            callId: call._id,
            claimId: call.claimId,
          });
          if (data && !cancelled) {
            // Freeze timer SYNCHRONOUSLY before async state update
            const isTerminal = data.status === 'done' || data.status === 'failed';
            if (isTerminal && callDoneDurationRef.current == null) {
              callDoneDurationRef.current = data.duration ||
                (call?.startedAt ? Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000) : 0);
              completionTriggeredRef.current = true;
              if (onComplete) onComplete(call._id);
            }
            setPolledData(data);
            if (isTerminal) {
              cancelled = true;
              return;
            }
          }
        } catch (err) { console.warn('Call status poll error:', err); }
        if (!cancelled) pollRef.current = setTimeout(poll, 3000);
      }
      poll();
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(startDelay);
      clearTimeout(pollRef.current);
    };
  }, [call?.elevenLabsConversationId, call?._id, call?.claimId, getCallStatus, onComplete]);

  const isCompleted = polledData?.status === 'done' || polledData?.status === 'failed' || call?.status === 'completed' || call?.status === 'failed';

  const effectiveTranscript = useMemo(() => {
    if (!polledData?.transcript) return [];
    return polledData.transcript
      .filter(t => t.message !== '...')
      .map(t => ({
        role: t.role === 'agent' ? 'agent' : 'user',
        message: t.message,
      }));
  }, [polledData]);

  // Use ref-based frozen duration (set synchronously) with fallback to state-based
  const frozenDuration = callDoneDurationRef.current != null
    ? callDoneDurationRef.current
    : (isCompleted && polledData?.duration ? polledData.duration : null);
  const elapsed = useElapsedTimer(call?.startedAt, frozenDuration);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [effectiveTranscript.length]);

  // Audio player — smooth playback with upsample to native rate
  useEffect(() => {
    playIntervalRef.current = setInterval(() => {
      if (mutedRef.current) return;
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const queue = audioQueueRef.current;
      if (queue.length < 640) return;

      const chunkSize = Math.min(queue.length, 1600);
      const raw = new Float32Array(queue.splice(0, chunkSize));
      const upsampled = upsample8kTo(raw, ctx.sampleRate);
      const buffer = ctx.createBuffer(1, upsampled.length, ctx.sampleRate);
      buffer.getChannelData(0).set(upsampled);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.005, nextPlayTimeRef.current);
      source.start(startAt);
      nextPlayTimeRef.current = startAt + buffer.duration;
    }, 80);

    return () => {
      clearInterval(playIntervalRef.current);
      audioQueueRef.current = [];
      nextPlayTimeRef.current = 0;
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // WebSocket for audio from bridge monitor
  useEffect(() => {
    if (!call?._id) return;
    const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'wss://cadence-bridge.onrender.com';
    let ws;
    let retryTimeout;

    function connect() {
      ws = new WebSocket(`${BRIDGE_URL}/listen/${call._id}`);
      wsRef.current = ws;

      ws.onopen = () => setAudioConnected(true);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'audio' && data.media?.payload) {
            // Only play inbound track — skip outbound (agent) to avoid 2x sample rate = slow motion
            if (data.media.track === 'outbound') return;

            const binary = atob(data.media.payload);
            for (let i = 0; i < binary.length; i++) {
              audioQueueRef.current.push(MULAW_TABLE[binary.charCodeAt(i) & 0xFF]);
            }
            if (audioQueueRef.current.length > 16000) {
              audioQueueRef.current.splice(0, audioQueueRef.current.length - 8000);
              nextPlayTimeRef.current = 0;
            }
          }
        } catch (err) { console.warn('Audio WS parse error:', err); }
      };

      ws.onclose = () => {
        setAudioConnected(false);
        retryTimeout = setTimeout(() => {
          if (wsRef.current === ws && !isCompleted) connect();
        }, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (ws) ws.close();
      wsRef.current = null;
      audioQueueRef.current = [];
    };
  }, [call?._id, isCompleted]);

  function ensureAudioContext() {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }

  function handleUnmute() {
    setMuted(false);
    ensureAudioContext();
  }

  function formatEntry(entry) {
    if (entry.message === null) return '[pressed key]';
    return entry.message;
  }

  function getLabel(entry) {
    return entry.role === 'agent' ? 'Thomas' : 'Phone';
  }

  return (
    <div className="bg-gradient-to-r from-accent/5 to-cyan/5 border border-accent/15 rounded-xl p-6 glow-border-strong space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
            <Phone className={`w-5 h-5 text-accent ${!isCompleted ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-display font-semibold text-gray-900">
              {isCompleted ? 'Call Completed' : 'Call in Progress'}
            </p>
            <p className="text-xs text-muted">{insurance?.name || 'Insurance'} — AI agent handling the call</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/80 border border-border rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 text-muted" />
          <span className="font-data text-sm text-gray-900">{elapsed}</span>
        </div>
      </div>

      {/* Audio player */}
      {!isCompleted && (
        <div className="bg-white/60 border border-border rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {audioConnected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                </span>
                <span className="text-sm text-gray-900 font-medium">{muted ? 'Click speaker to listen' : 'Live Audio'}</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warn" />
                </span>
                <span className="text-sm text-warn font-medium">Connecting audio...</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (muted) {
                handleUnmute();
              } else {
                setMuted(true);
              }
              ensureAudioContext();
            }}
            className={`p-2 rounded-lg transition-colors ${muted ? 'text-muted hover:text-gray-900 hover:bg-gray-100' : 'text-accent hover:bg-accent/10'}`}
            title={muted ? 'Click to listen' : 'Mute'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Live Transcript — shown during AND after call */}
      {effectiveTranscript.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <MessageSquare className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              {isCompleted ? 'Call Transcript' : 'Live Transcript'}
            </span>
            {!isCompleted && (
              <span className="flex items-center gap-1 ml-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
                </span>
                <span className="text-xs text-accent font-medium">Live</span>
              </span>
            )}
          </div>
          <div className="bg-white/60 border border-border rounded-lg p-3 max-h-56 overflow-y-auto space-y-1.5">
            {effectiveTranscript.map((t, i) => (
              <div key={i} className={`text-xs ${t.role === 'agent' ? 'text-accent' : 'text-gray-600'}`}>
                <span className="font-data font-medium">{getLabel(t)}:</span>
                <span className="ml-1.5">{formatEntry(t)}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Waiting for transcript — during call before transcript arrives */}
      {!isCompleted && effectiveTranscript.length === 0 && (
        <div className="bg-white/60 border border-border rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-accent animate-spin" />
          <span className="text-sm text-muted">Waiting for transcript data...</span>
        </div>
      )}

      {/* Completed summary */}
      {isCompleted && (
        <div className="bg-white/80 border border-success/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-gray-900">Call Completed</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Transcript analysis is processing. Results will appear in the claim details shortly.
          </p>
        </div>
      )}

      {/* Status message during call */}
      {!isCompleted && (
        <p className="text-xs text-muted text-center">
          Thomas is navigating the IVR, waiting on hold, and will speak with the insurance rep automatically.
        </p>
      )}
    </div>
  );
}
