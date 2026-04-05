import { useState, useEffect, useRef } from 'react';
import { Phone, Volume2, VolumeX, Clock, MessageSquare, Radio, Pause, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------
function useElapsedTimer(startIso) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startIso) return;
    const start = new Date(startIso).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Standard ITU-T G.711 mu-law decode table (correct implementation)
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
// Phase config
// ---------------------------------------------------------------------------
const PHASE_CONFIG = {
  connecting: { label: 'Connecting', icon: Phone, color: 'text-warn', bgColor: 'bg-warn/10', borderColor: 'border-warn/30' },
  ivr: { label: 'IVR Navigation', icon: Radio, color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
  hold: { label: 'On Hold', icon: Pause, color: 'text-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
  conversation: { label: 'Live Conversation', icon: Users, color: 'text-success', bgColor: 'bg-success/10', borderColor: 'border-success/30' },
};

// ---------------------------------------------------------------------------
// LiveCallMonitor
// ---------------------------------------------------------------------------
export default function LiveCallMonitor({ call, insurance }) {
  const elapsed = useElapsedTimer(call?.startedAt);

  const [audioStatus, setAudioStatus] = useState('connecting');
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [callPhase, setCallPhase] = useState('connecting');
  const wsRef = useRef(null);
  const mutedRef = useRef(false);
  const transcriptEndRef = useRef(null);

  // Audio playback refs
  const audioCtxRef = useRef(null);
  const audioQueueRef = useRef([]); // buffered decoded Float32 samples
  const nextPlayTimeRef = useRef(0);
  const playIntervalRef = useRef(null);
  const MULAW_SAMPLE_RATE = 8000;

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts]);

  // Audio player — accumulates ~250ms of samples then schedules gapless playback.
  // Key fix: AudioContext runs at the browser's native sample rate (usually 48kHz).
  // createBuffer(1, len, 8000) tells the browser the source is 8kHz; it auto-resamples.
  useEffect(() => {
    const BATCH_SIZE = 2000; // ~250ms at 8kHz

    playIntervalRef.current = setInterval(() => {
      if (mutedRef.current) return;
      const queue = audioQueueRef.current;
      if (queue.length < BATCH_SIZE) return;

      // Create AudioContext at DEFAULT sample rate — never force 8kHz
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Take all available samples
      const samples = new Float32Array(queue.splice(0, queue.length));

      // Create buffer at 8kHz — browser auto-resamples to native rate on playback
      const buffer = ctx.createBuffer(1, samples.length, MULAW_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      // Schedule sequentially to avoid gaps/overlaps
      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.01, nextPlayTimeRef.current);
      source.start(startAt);
      nextPlayTimeRef.current = startAt + buffer.duration;
    }, 250);

    return () => clearInterval(playIntervalRef.current);
  }, []);

  useEffect(() => {
    if (!call?._id) return;

    const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'wss://cadence-bridge.onrender.com';
    let ws;
    let retryTimeout;

    function decodeMulaw(base64Payload) {
      const binary = atob(base64Payload);
      const samples = new Float32Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        samples[i] = MULAW_TABLE[binary.charCodeAt(i) & 0xFF];
      }
      return samples;
    }

    function connect() {
      ws = new WebSocket(`${BRIDGE_URL}/listen/${call._id}`);
      wsRef.current = ws;

      ws.onopen = () => setAudioStatus('live');

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === 'audio' && data.media?.payload) {
            // Decode mulaw and push to audio queue
            const pcm = decodeMulaw(data.media.payload);
            audioQueueRef.current.push(...pcm);
            // Cap queue at 3 seconds of audio (8kHz) to prevent memory buildup
            if (audioQueueRef.current.length > 24000) {
              audioQueueRef.current.splice(0, audioQueueRef.current.length - 24000);
            }
          } else if (data.event === 'transcript') {
            const entry = { role: data.role, text: data.text, time: Date.now() };
            setTranscripts(prev => [...prev.slice(-50), entry]);

            const text = (data.text || '').toLowerCase();
            if (text.includes('press') || text.includes('menu') || text.includes('option') || text.includes('dial')) {
              setCallPhase('ivr');
            } else if (text.includes('hold') || text.includes('wait') || text.includes('your call is important') || text.includes('please stay on the line')) {
              setCallPhase('hold');
            } else if (data.role === 'user' && !text.includes('press') && !text.includes('menu') && text.length > 10) {
              setCallPhase('conversation');
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setAudioStatus('disconnected');
        retryTimeout = setTimeout(() => {
          if (wsRef.current === ws) connect();
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
  }, [call?._id]);

  const handleUnmute = () => {
    setMuted(false);
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const phaseConfig = PHASE_CONFIG[callPhase] || PHASE_CONFIG.connecting;
  const PhaseIcon = phaseConfig.icon;

  return (
    <div className="bg-gradient-to-r from-accent/5 to-cyan/5 border border-accent/15 rounded-xl p-6 glow-border-strong space-y-4">
      {/* Call status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
            <Phone className="w-5 h-5 text-accent animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-display font-semibold text-gray-900">Call in Progress</p>
            <p className="text-xs text-muted">{insurance?.name || 'Insurance'} — AI agent is handling the call</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/80 border border-border rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 text-muted" />
          <span className="font-data text-sm text-gray-900">{elapsed}</span>
        </div>
      </div>

      {/* Phase indicator */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${phaseConfig.bgColor} ${phaseConfig.borderColor}`}>
        <PhaseIcon className={`w-4 h-4 ${phaseConfig.color}`} />
        <span className={`text-sm font-medium ${phaseConfig.color}`}>{phaseConfig.label}</span>
        {callPhase === 'ivr' && <span className="text-xs text-muted ml-auto">Agent is navigating the phone menu</span>}
        {callPhase === 'hold' && <span className="text-xs text-muted ml-auto">Waiting for a representative</span>}
        {callPhase === 'conversation' && <span className="text-xs text-muted ml-auto">Speaking with insurance rep</span>}
      </div>

      {/* Live transcript */}
      {transcripts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <MessageSquare className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Live Transcript</span>
          </div>
          <div className="bg-white/60 border border-border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5">
            {transcripts.map((t, i) => (
              <div key={i} className={`text-xs ${t.role === 'agent' ? 'text-accent' : 'text-gray-600'}`}>
                <span className="font-data font-medium">{t.role === 'agent' ? 'Thomas' : 'Phone'}:</span>
                <span className="ml-1.5">{t.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Live audio player */}
      <div className="bg-white/60 border border-border rounded-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {audioStatus === 'live' ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
              </span>
              <span className="text-sm text-gray-900 font-medium">Live Audio</span>
            </>
          ) : audioStatus === 'connecting' ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warn" />
              </span>
              <span className="text-sm text-warn font-medium">Connecting audio stream...</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-muted/40" />
              <span className="text-sm text-muted">Audio stream waiting for call to connect</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => muted ? handleUnmute() : setMuted(true)}
          className={`p-2 rounded-lg transition-colors ${muted ? 'text-muted hover:text-gray-900 hover:bg-gray-100' : 'text-accent hover:bg-accent/10'}`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      <p className="text-xs text-muted text-center">
        The AI agent is navigating the phone system, waiting on hold, and will speak with the insurance rep automatically.
        {audioStatus === 'live' && !muted && ' You should hear the call audio.'}
      </p>
    </div>
  );
}
