import {
  Building2,
  CalendarDays,
  FileText,
  Hash,
  Phone,
  Stethoscope,
  User,
} from 'lucide-react';

function valueOrDash(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

// claim.amount (and thus call.claimAmount) is stored in cents — see
// AddClaimModal.jsx's Math.round(dollars * 100) and devSeed.ts's seed values.
function formatMoney(cents) {
  if (cents === null || cents === undefined || cents === '') return '-';
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return String(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatList(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.filter(Boolean).join(', ') || null;
}

function latestTranscriptText(call) {
  const transcript = call?.transcript || call?.humanTranscript || '';
  if (!transcript || typeof transcript !== 'string') return '';
  return transcript.trim();
}

function ContextItem({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/70">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="mt-1 text-sm text-gray-900 truncate" title={String(valueOrDash(value))}>
        {valueOrDash(value)}
      </p>
    </div>
  );
}

function CompactPill({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700">
      <span className="text-muted">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </span>
  );
}

export default function HandoffContextCard({ call, embedded = false }) {
  const subject = call?.claimNumber
    ? `Claim ${call.claimNumber}`
    : call?.dentalCaseNumber
      ? `Case ${call.dentalCaseNumber}`
      : 'Verification call';
  const transcript = latestTranscriptText(call);
  const codes = formatList(call?.cptCodes);
  const diagnosisCodes = formatList(call?.diagnosisCodes);

  return (
    <div className={embedded ? 'rounded-lg border border-border bg-white p-4 shadow-sm' : 'mt-4 border-t border-accent/15 pt-4'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted/70">
            Handoff Context
          </p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{subject}</p>
        </div>
        <div className="flex max-w-full flex-wrap gap-1.5">
          <CompactPill label="Status" value={call?.claimStatus} />
          <CompactPill label="Priority" value={call?.claimPriority} />
          <CompactPill label="Assigned" value={call?.assignedAgentName} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ContextItem icon={User} label="Patient" value={call?.patientName} />
        <ContextItem icon={Building2} label="Payer" value={call?.insuranceCompany} />
        <ContextItem icon={Stethoscope} label="Provider" value={call?.providerName} />
        <ContextItem icon={Hash} label="Member ID" value={call?.memberId} />
        <ContextItem icon={CalendarDays} label="DOS" value={call?.dateOfService} />
        <ContextItem icon={Phone} label="Rep Line" value={call?.humanAgentNumber} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <CompactPill label="DOB" value={call?.patientDob} />
        <CompactPill label="Amount" value={call?.claimAmount != null ? formatMoney(call.claimAmount) : null} />
        <CompactPill label="Codes" value={codes} />
        <CompactPill label="Dx" value={diagnosisCodes} />
      </div>

      {call?.handoffReason && (
        <div className="mt-3 rounded-lg bg-warn/5 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium text-gray-900">Reason: </span>
          {call.handoffReason}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/70">
          <FileText className="h-3.5 w-3.5" />
          Latest Transcript
        </div>
        {transcript ? (
          <p className="max-h-28 overflow-y-auto rounded-lg bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap">
            {transcript}
          </p>
        ) : (
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-muted">
            Live transcript will appear here once conversation text is available.
          </p>
        )}
      </div>
    </div>
  );
}
