import { useState, useEffect, useRef } from 'react';
import { PhoneForwarded, Clock, UserCheck, MessageSquare, CheckCircle2, Volume2, VolumeX } from 'lucide-react';

// ---------------------------------------------------------------------------
// Phase definitions
// ---------------------------------------------------------------------------
const PHASES = [
  { key: 'ivr', label: 'Navigating IVR', icon: PhoneForwarded },
  { key: 'hold', label: 'Waiting on Hold', icon: Clock },
  { key: 'connecting', label: 'Connecting to Rep', icon: UserCheck },
  { key: 'conversation', label: 'AI Conversation', icon: MessageSquare },
];

const PHASE_INDEX = { ivr: 0, hold: 1, connecting: 2, conversation: 3 };

// ---------------------------------------------------------------------------
// Hold timer display
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
// LiveCallMonitor
// ---------------------------------------------------------------------------
export default function LiveCallMonitor({ call, insurance }) {
  const currentPhase = call?.callPhase || 'ivr';
  const activeIdx = PHASE_INDEX[currentPhase] ?? 0;

  // Hold timer — starts from holdStartedAt or call.startedAt
  const timerStart = currentPhase === 'hold' ? (call?.holdStartedAt || call?.startedAt) : call?.startedAt;
  const elapsed = useElapsedTimer(timerStart);

  // WebSocket audio status
  const [wsConnected, setWsConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!call?._id) return;

    const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'wss://cadence-bridge.onrender.com';
    const ws = new WebSocket(`${BRIDGE_URL}/listen/${call._id}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    // Audio monitoring — visual indicator only in v1
    ws.onmessage = () => {
      // Future: decode mulaw/PCM audio via Web Audio API
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [call?._id]);

  return (
    <div className="bg-gradient-to-r from-accent/5 to-cyan/5 border border-accent/15 rounded-xl p-6 glow-border-strong space-y-6">
      {/* Phase tracker */}
      <div className="flex items-center justify-between gap-2">
        {PHASES.map((phase, i) => {
          const Icon = phase.icon;
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          const isPending = i > activeIdx;

          return (
            <div key={phase.key} className="flex-1 flex flex-col items-center gap-2">
              {/* Icon circle */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                  isDone
                    ? 'bg-success/10 border-success text-success'
                    : isActive
                      ? 'bg-accent/10 border-accent text-accent animate-pulse'
                      : 'bg-gray-100 border-border text-muted'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-xs font-medium text-center leading-tight ${
                  isDone ? 'text-success' : isActive ? 'text-accent' : 'text-muted'
                }`}
              >
                {phase.label}
              </span>

              {/* Hold timer under the hold phase */}
              {phase.key === 'hold' && isActive && (
                <span className="text-xs font-data text-accent">{elapsed}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Connecting bar between phases */}
      <div className="flex items-center gap-1 px-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex-1 h-0.5 rounded-full transition-colors ${
              i < activeIdx ? 'bg-success' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* IVR sequence display */}
      {call?.ivrSequenceUsed && (
        <div className="bg-white/60 border border-border rounded-lg px-4 py-2.5 flex items-center gap-3">
          <PhoneForwarded className="w-4 h-4 text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted uppercase tracking-wider font-medium mb-0.5">IVR Sequence Sent</p>
            <code className="text-xs font-data text-accent break-all">{call.ivrSequenceUsed}</code>
          </div>
        </div>
      )}

      {/* Live audio indicator */}
      <div className="bg-white/60 border border-border rounded-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {wsConnected ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
              </span>
              <span className="text-sm text-gray-900 font-medium">Live Audio Connected</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-muted/40" />
              <span className="text-sm text-muted">Audio Disconnected</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMuted((v) => !v)}
          className={`p-2 rounded-lg transition-colors ${
            muted ? 'text-muted hover:text-gray-900 hover:bg-gray-100' : 'text-accent hover:bg-accent/10'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {wsConnected && (
        <p className="text-xs text-muted text-center">
          Audio monitoring active — you'll hear IVR prompts, hold music, and the conversation
        </p>
      )}
    </div>
  );
}
