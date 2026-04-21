import {
  ShieldCheck,
  ShieldAlert,
  DollarSign,
  Percent,
  Network,
  Clock,
  CalendarRange,
  AlertTriangle,
} from 'lucide-react';

function formatCurrency(cents) {
  if (cents == null) return null;
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function Missing() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warn/80">
      <AlertTriangle className="w-3 h-3" />
      Not provided
    </span>
  );
}

function Meter({ used, total, color = 'bg-accent' }) {
  if (used == null || total == null || total === 0) {
    return (
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div className="h-full bg-gray-200 w-0" />
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / total) * 100));
  return (
    <div className="h-2 rounded-full bg-surface overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted uppercase tracking-wider font-medium">{label}</p>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  );
}

export default function EvResultsCard({ result }) {
  if (!result) {
    return (
      <div className="bg-white border border-border rounded-xl px-5 py-8 text-center shadow-sm">
        <ShieldAlert className="w-6 h-6 text-muted/40 mx-auto mb-2" />
        <p className="text-sm text-muted/60">No eligibility data yet. Run an EV call to get benefits.</p>
      </div>
    );
  }

  const {
    isActive: coverageActive,
    deductibleAnnualCents: deductibleTotal,
    deductibleMetCents: deductibleUsed,
    annualMaximumCents: annualMax,
    annualMaxRemainingCents,
    coinsurancePct: coinsurance,
    copayCents: copay,
    networkStatus,
    frequencyLimits,
    waitingPeriods,
    coverageEffectiveDate: effectiveDate,
    coverageTerminationDate: termDate,
    confidence,
  } = result;
  // annualMaxRemainingCents is what's left; derive used = total - remaining
  const annualMaxUsed =
    annualMax != null && annualMaxRemainingCents != null
      ? annualMax - annualMaxRemainingCents
      : null;

  return (
    <div className="bg-white border border-accent/15 rounded-xl overflow-hidden shadow-sm glow-border">
      {/* Header */}
      <div className="border-b border-border px-5 py-3 flex items-center justify-between bg-accent/5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-display font-semibold text-gray-900">Eligibility & Benefits</h3>
          {coverageActive != null && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                coverageActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${coverageActive ? 'bg-success' : 'bg-danger'}`} />
              {coverageActive ? 'Coverage Active' : 'Coverage Inactive'}
            </span>
          )}
        </div>
        {confidence != null && (
          <span className="text-xs font-data text-muted">
            {Math.round(confidence * 100)}% confidence
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-5 space-y-6">
        {/* Meters row: deductible + annual max */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted uppercase tracking-wider font-medium">Deductible</p>
              <span className="text-sm font-data text-gray-900">
                {deductibleUsed != null && deductibleTotal != null ? (
                  <>
                    <span className="text-gray-900">{formatCurrency(deductibleUsed)}</span>
                    <span className="text-muted"> / {formatCurrency(deductibleTotal)}</span>
                  </>
                ) : (
                  <Missing />
                )}
              </span>
            </div>
            <Meter used={deductibleUsed} total={deductibleTotal} color="bg-warn" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted uppercase tracking-wider font-medium">Annual Maximum</p>
              <span className="text-sm font-data text-gray-900">
                {annualMaxUsed != null && annualMax != null ? (
                  <>
                    <span className="text-gray-900">{formatCurrency(annualMaxUsed)}</span>
                    <span className="text-muted"> / {formatCurrency(annualMax)}</span>
                  </>
                ) : (
                  <Missing />
                )}
              </span>
            </div>
            <Meter used={annualMaxUsed} total={annualMax} color="bg-accent" />
          </div>
        </div>

        {/* Stat pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="w-3 h-3 text-muted" />
              <span className="text-xs text-muted uppercase tracking-wider font-medium">Coinsurance</span>
            </div>
            <p className="text-sm font-data text-gray-900">
              {coinsurance != null ? `${coinsurance}%` : <Missing />}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3 h-3 text-muted" />
              <span className="text-xs text-muted uppercase tracking-wider font-medium">Copay</span>
            </div>
            <p className="text-sm font-data text-gray-900">
              {copay != null ? formatCurrency(copay) : <Missing />}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Network className="w-3 h-3 text-muted" />
              <span className="text-xs text-muted uppercase tracking-wider font-medium">Network</span>
            </div>
            {networkStatus ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  networkStatus === 'in_network'
                    ? 'bg-success/10 text-success'
                    : networkStatus === 'out_of_network'
                      ? 'bg-danger/10 text-danger'
                      : 'bg-warn/10 text-warn'
                }`}
              >
                {networkStatus === 'in_network'
                  ? 'In-Network'
                  : networkStatus === 'out_of_network'
                    ? 'Out-of-Network'
                    : 'Unknown'}
              </span>
            ) : (
              <Missing />
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarRange className="w-3 h-3 text-muted" />
              <span className="text-xs text-muted uppercase tracking-wider font-medium">AI Confidence</span>
            </div>
            <p className="text-sm font-data text-gray-900">
              {confidence != null ? `${Math.round(confidence * 100)}%` : <Missing />}
            </p>
          </div>
        </div>

        {/* Effective / Term dates */}
        <div className="grid grid-cols-2 gap-5 pt-4 border-t border-border">
          <Field label="Effective Date">
            {effectiveDate ? (
              <span className="font-data">{new Date(effectiveDate).toLocaleDateString()}</span>
            ) : (
              <Missing />
            )}
          </Field>
          <Field label="Term Date">
            {termDate ? (
              <span className="font-data">{new Date(termDate).toLocaleDateString()}</span>
            ) : (
              <Missing />
            )}
          </Field>
        </div>

        {/* Frequency limits */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">Frequency Limits</p>
          {frequencyLimits && frequencyLimits.length > 0 ? (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white border-b border-border">
                    <th className="px-3 py-2 text-left text-muted font-medium">CDT Code</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Limit</th>
                    <th className="px-3 py-2 text-right text-muted font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {frequencyLimits.map((f, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-3 py-2 font-data text-accent">{f.cdtCode}</td>
                      <td className="px-3 py-2 text-gray-700">{f.limitDescription}</td>
                      <td className="px-3 py-2 text-right font-data text-gray-900">
                        {f.remainingThisYear ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Missing />
          )}
        </div>

        {/* Waiting periods */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3 h-3 text-muted" />
            <p className="text-xs text-muted uppercase tracking-wider font-medium">Waiting Periods</p>
          </div>
          {waitingPeriods && waitingPeriods.length > 0 ? (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white border-b border-border">
                    <th className="px-3 py-2 text-left text-muted font-medium">CDT Code</th>
                    <th className="px-3 py-2 text-left text-muted font-medium">Status</th>
                    <th className="px-3 py-2 text-right text-muted font-medium">Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {waitingPeriods.map((w, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-3 py-2 font-data text-accent">{w.cdtCode}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {w.satisfied ? 'Satisfied' : 'Pending'}
                      </td>
                      <td className="px-3 py-2 text-right font-data text-gray-900">
                        {w.endsOn ? new Date(w.endsOn).toLocaleDateString() : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Missing />
          )}
        </div>
      </div>
    </div>
  );
}
