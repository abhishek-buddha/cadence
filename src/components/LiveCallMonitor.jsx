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
// Mu-law decode table (standard ITU-T G.711)
// ---------------------------------------------------------------------------
const MULAW_DECODE = new Int16Array(256);
(function buildTable() {
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xff;
    let sign = mu & 0x80 ? -1 : 1;
    let exponent = (mu >> 4) & 0x07;
    let mantissa = mu & 0x0f;
    let sample = (mantissa * 2 + 33) * (1 << exponent) - 33;
    MULAW_DECODE[i] = sign * sample;
  }
})();

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
// LiveCallMonitor — shows during active call with live audio + transcript
// ---------------------------------------------------------------------------
export default function LiveCallMonitor({ call, insurance }) {
  const elapsed = useElapsedTimer(call?.startedAt);

  const [audioStatus, setAudioStatus] = useState('connecting'); // connecting | live | disconnected
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [callPhase, setCallPhase] = useState('connecting');
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const mutedRef = useRef(false);
  const transcriptEndRef = useRef(null);

  // Keep muted ref in sync
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts]);

  useEffect(() => {
    if (!call?._id) return;

    const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'wss://cadence-bridge.onrender.com';
    let ws;
    let retryTimeout;

    function connect() {
      ws = new WebSocket(`${BRIDGE_URL}/listen/${call._id}`);
      wsRef.current = ws;

      ws.onopen = () => setAudioStatus('live');

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === 'audio' && data.media?.payload) {
            if (!mutedRef.current) {
              playMulawAudio(data.media.payload);
            }
          } else if (data.event === 'transcript') {
            const entry = {
              role: data.role,
              text: data.text,
              time: Date.now(),
            };
            setTranscripts(prev => [...prev.slice(-50), entry]);

            // Auto-detect phase from transcript content
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
        // Retry after 3s if call is still active
        retryTimeout = setTimeout(() => {
          if (wsRef.current === ws) connect();
        }, 3000);
      };

      ws.onerror = () => ws.close();
    }

    function playMulawAudio(base64Payload) {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext({ sampleRate: 8000 });
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const raw = atob(base64Payload);
        const samples = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          samples[i] = MULAW_DECODE[raw.charCodeAt(i)] / 32768;
        }

        const buffer = ctx.createBuffer(1, samples.length, 8000);
        buffer.getChannelData(0).set(samples);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      } catch {
        // Audio playback errors are non-fatal
      }
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [call?._id]);

  // Resume AudioContext on user interaction (browser autoplay policy)
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
            <p className="text-sm font-display font-semibold text-gray-900">
              Call in Progress
            </p>
            <p className="text-xs text-muted">
              {insurance?.name || 'Insurance'} — AI agent is handling the call
            </p>
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
        {callPhase === 'ivr' && (
          <span className="text-xs text-muted ml-auto">Agent is navigating the phone menu</span>
        )}
        {callPhase === 'hold' && (
          <span className="text-xs text-muted ml-auto">Waiting for a representative</span>
        )}
        {callPhase === 'conversation' && (
          <span className="text-xs text-muted ml-auto">Speaking with insurance rep</span>
        )}
      </div>

      {/* Live transcript log */}
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
          className={`p-2 rounded-lg transition-colors ${
            muted ? 'text-muted hover:text-gray-900 hover:bg-gray-100' : 'text-accent hover:bg-accent/10'
          }`}
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
