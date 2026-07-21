// Read-only detail view for a single claim, laid out to match
// HandoffContextCard so a sibling claim reads exactly like the handed-off one.
// Presentational only — takes an already-enriched claim from
// api.claimFollowups.listRelatedForCall.

import {
  Building2,
  CalendarDays,
  Hash,
  Stethoscope,
  User,
  FileText,
  DollarSign,
} from 'lucide-react';

function valueOrDash(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === '') return '-';
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatList(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.filter(Boolean).join(', ') || null;
}

function Item({ icon: Icon, label, value }) {
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

function Pill({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700">
      <span className="text-muted">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </span>
  );
}

export default function ClaimDetailBlock({ claim }) {
  if (!claim) return null;
  const codes = formatList(claim.cptCodes);
  const dx = formatList(claim.diagnosisCodes);

  return (
    <div className="rounded-lg border border-border bg-panel-light/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Item icon={User} label="Patient" value={claim.patientName} />
        <Item icon={Building2} label="Payer" value={claim.insuranceCompany} />
        <Item icon={Stethoscope} label="Provider" value={claim.providerName} />
        <Item icon={Hash} label="Member ID" value={claim.memberId} />
        <Item icon={CalendarDays} label="DOS" value={claim.dateOfService} />
        <Item icon={DollarSign} label="Amount" value={claim.amount != null ? formatMoney(claim.amount) : null} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill label="DOB" value={claim.patientDob} />
        <Pill label="Codes" value={codes} />
        <Pill label="Dx" value={dx} />
        <Pill label="Aging" value={claim.agingBucket} />
        <Pill label="Ref #" value={claim.referenceNumber} />
        <Pill label="Submitted" value={claim.dateSubmitted} />
      </div>

      {(claim.denialCode || claim.denialReason) && (
        <div className="mt-3 rounded-lg bg-danger/5 border border-danger/15 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium text-danger">Denial: </span>
          {[claim.denialCode, claim.denialReason].filter(Boolean).join(' — ')}
        </div>
      )}

      {claim.notes && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/70">
            <FileText className="h-3.5 w-3.5" />
            Notes
          </div>
          <p className="rounded-lg bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap">
            {claim.notes}
          </p>
        </div>
      )}
    </div>
  );
}
