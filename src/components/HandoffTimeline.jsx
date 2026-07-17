// HandoffTimeline — visual state machine of an AI→human handoff for one call.
// Pure presentational: derives steps from handoffState + event timestamps.
// Shows: AI navigating IVR → insurance human detected → awaiting our agent →
// [name] accepted → connected (human ↔ human).

import { Bot, PhoneIncoming, Radio, UserCheck, PhoneCall, XCircle } from 'lucide-react';

const STEPS = [
  { key: 'ai_ivr', label: 'AI navigating IVR', icon: Bot },
  { key: 'detected', label: 'Insurance rep on the line', icon: PhoneIncoming },
  { key: 'awaiting', label: 'Awaiting our agent', icon: Radio },
  { key: 'accepted', label: 'Agent accepted', icon: UserCheck },
  { key: 'connected', label: 'Connected — human to human', icon: PhoneCall },
];

// Map handoffState → index of the furthest reached step.
function reachedIndex(handoffState, status) {
  switch (handoffState) {
    case 'connected':
      return 4;
    case 'accepting':
      return 3;
    case 'awaiting_human':
      return 2;
    case 'handoff_ended':
      return 4;
    default:
      // No handoff yet — AI is still working the IVR (or call just started).
      return status === 'in_progress' || status === 'initiating' ? 0 : 0;
  }
}

function fmtTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return null;
  }
}

export default function HandoffTimeline({ call, events = [] }) {
  const failed = call?.handoffState === 'handoff_failed';
  const reached = reachedIndex(call?.handoffState, call?.status);

  // Pull representative timestamps from events for step captions.
  const evtTime = (type) => fmtTime(events.find((e) => e.type === type)?.timestamp);
  const captions = {
    detected: evtTime('handoff_requested') || fmtTime(call?.handoffRequestedAt),
    accepted: evtTime('handoff_accepted') || fmtTime(call?.handoffAcceptedAt),
    connected: evtTime('handoff_connected'),
  };
  const acceptedBy = call?.handoffAcceptedByEmail || call?.handoffAcceptedByUserId;

  return (
    <div className="flex flex-col gap-0.5">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i < reached;
        const current = i === reached && !failed;
        const pending = i > reached;
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-start gap-3">
            {/* Rail + node */}
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                  done
                    ? 'bg-success/10 border-success/30 text-success'
                    : current
                      ? 'bg-accent/10 border-accent/40 text-accent animate-pulse'
                      : 'bg-gray-50 border-border text-muted/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              {!isLast && (
                <div
                  className={`w-px flex-1 min-h-[18px] ${done ? 'bg-success/30' : 'bg-border'}`}
                />
              )}
            </div>

            {/* Label */}
            <div className={`pb-2 ${pending ? 'opacity-50' : ''}`}>
              <p
                className={`text-sm font-medium ${
                  current ? 'text-accent' : done ? 'text-gray-800' : 'text-muted'
                }`}
              >
                {step.label}
                {step.key === 'accepted' && acceptedBy ? (
                  <span className="text-gray-500 font-normal"> · {acceptedBy}</span>
                ) : null}
              </p>
              {captions[step.key] && (
                <p className="text-[11px] text-muted font-data mt-0.5">{captions[step.key]}</p>
              )}
            </div>
          </div>
        );
      })}

      {failed && (
        <div className="flex items-center gap-2 mt-1 text-danger text-sm font-medium">
          <XCircle className="w-4 h-4" />
          Handoff failed — no agent connected
        </div>
      )}
    </div>
  );
}
