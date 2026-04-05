import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Phone, Clock, CheckCircle2, Radio, Pause, Users, MessageSquare, Loader2 } from 'lucide-react';

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
export default function LiveCallMonitor({ call, insurance }) {
  const getCallStatus = useAction(api.callActions.getCallStatus);
  const transcriptEndRef = useRef(null);
  const completionTriggeredRef = useRef(false);

  // Real-time subscription to call events via Convex
  const events = useQuery(
    api.callEvents.listByCall,
    call?._id ? { callId: call._id } : 'skip'
  );

  // Derive phase from real-time events
  const phase = useMemo(() => {
    if (!events || events.length === 0) return 'connecting';

    // Check for call ended status event
    const hasEnded = events.some(e => e.type === 'status' && e.message === 'Call ended');
    if (hasEnded) return 'completed';

    // Also check if the call record itself is completed/failed
    if (call?.status === 'completed' || call?.status === 'failed') return 'completed';

    const lastEvents = events.slice(-5);

    // Check for human conversation (agent responses with substantial content)
    const hasConversation = lastEvents.some(e =>
      e.type === 'agent_response' && e.message && e.message.length > 30 &&
      !e.message.includes('still here') && !e.message.includes('checking in')
    );
    if (hasConversation) return 'conversation';

    // Check for hold indicators
    const allText = events.map(e => (e.message || '').toLowerCase()).join(' ');
    if (allText.includes('hold') || allText.includes('wait') || allText.includes('important')) return 'hold';

    // Check for IVR (tool calls = DTMF key presses)
    if (events.some(e => e.type === 'tool_call')) return 'ivr';

    return 'connecting';
  }, [events, call?.status]);

  // Map events to transcript entries for display
  const transcript = useMemo(() => {
    return (events || [])
      .filter(e => e.type !== 'status')
      .map(e => ({
        role: e.type === 'agent_response' ? 'agent' : e.type === 'tool_call' ? 'agent' : 'user',
        message: e.type === 'tool_call' ? null : e.message,
      }));
  }, [events]);

  // When phase becomes 'completed', trigger getCallStatus ONCE to finalize the call
  // (mark as done in Convex, trigger transcript analysis)
  useEffect(() => {
    if (phase !== 'completed') return;
    if (completionTriggeredRef.current) return;
    if (!call?.elevenLabsConversationId) return;

    completionTriggeredRef.current = true;
    getCallStatus({
      conversationId: call.elevenLabsConversationId,
      callId: call._id,
      claimId: call.claimId,
    }).catch(() => {
      // Non-fatal: webhook or status callback may have already handled this
    });
  }, [phase, call?.elevenLabsConversationId, call?._id, call?.claimId, getCallStatus]);

  const frozenDuration = phase === 'completed' && call?.duration ? call.duration : null;
  const elapsed = useElapsedTimer(call?.startedAt, frozenDuration);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length]);

  // Phase definitions
  const phases = [
    { key: 'connecting', label: 'Connecting', icon: Phone },
    { key: 'ivr', label: 'IVR Navigation', icon: Radio },
    { key: 'hold', label: 'On Hold', icon: Pause },
    { key: 'conversation', label: 'Talking to Rep', icon: Users },
  ];

  const phaseOrder = ['connecting', 'ivr', 'hold', 'conversation', 'completed'];
  const currentIdx = phaseOrder.indexOf(phase);

  // Format transcript entry
  function formatEntry(entry) {
    if (entry.message === null) return '[pressed key]';
    if (entry.message === '...') return '...';
    return entry.message;
  }

  function getLabel(entry) {
    if (entry.role === 'agent') return 'Thomas';
    return 'Phone';
  }

  return (
    <div className="bg-gradient-to-r from-accent/5 to-cyan/5 border border-accent/15 rounded-xl p-6 glow-border-strong space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
            <Phone className={`w-5 h-5 text-accent ${phase !== 'completed' ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-display font-semibold text-gray-900">
              {phase === 'completed' ? 'Call Completed' : 'Call in Progress'}
            </p>
            <p className="text-xs text-muted">{insurance?.name || 'Insurance'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/80 border border-border rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 text-muted" />
          <span className="font-data text-sm text-gray-900">{elapsed}</span>
        </div>
      </div>

      {/* Workflow phases */}
      <div className="flex items-center gap-1">
        {phases.map((p) => {
          const Icon = p.icon;
          const idx = phaseOrder.indexOf(p.key);
          const isDone = currentIdx > idx;
          const isActive = currentIdx === idx;

          return (
            <div key={p.key} className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isDone ? 'bg-success/10 text-success border border-success/20' :
              isActive ? 'bg-accent/10 text-accent border border-accent/20' :
              'bg-gray-50 text-muted border border-border'
            }`}>
              {isDone ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> :
               isActive ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> :
               <Icon className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{p.label}</span>
            </div>
          );
        })}
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <MessageSquare className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              {phase === 'completed' ? 'Call Transcript' : 'Live Transcript'}
            </span>
          </div>
          <div className="bg-white/60 border border-border rounded-lg p-3 max-h-56 overflow-y-auto space-y-1.5">
            {transcript.filter(t => t.message !== '...').map((t, i) => (
              <div key={i} className={`text-xs ${t.role === 'agent' ? 'text-accent' : 'text-gray-600'}`}>
                <span className="font-data font-medium">{getLabel(t)}:</span>
                <span className="ml-1.5">{formatEntry(t)}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Completed summary */}
      {phase === 'completed' && (
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

      {/* Status message */}
      {phase !== 'completed' && (
        <p className="text-xs text-muted text-center">
          {phase === 'connecting' && 'Connecting to insurance company...'}
          {phase === 'ivr' && 'Thomas is navigating the phone menu using DTMF keys'}
          {phase === 'hold' && 'On hold -- waiting for a representative'}
          {phase === 'conversation' && 'Thomas is speaking with the insurance representative'}
        </p>
      )}
    </div>
  );
}
