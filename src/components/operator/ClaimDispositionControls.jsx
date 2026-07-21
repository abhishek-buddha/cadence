// Per-claim disposition + comment control used in the operator's post-call
// workspace. Lets a human pick the next action for a claim after (or during) a
// payer call and leave a note. Writes to api.claimFollowups.setDisposition.

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  CheckCircle2,
  RefreshCw,
  CalendarClock,
  XCircle,
  Loader2,
  Check,
} from 'lucide-react';

// Visual + semantic config for each disposition. `needsDate` reveals a
// follow-up date input (retry/reschedule imply another attempt).
const OPTIONS = [
  { key: 'complete', label: 'Complete', icon: CheckCircle2, needsDate: false,
    active: 'border-success bg-success/10 text-success', idle: 'hover:border-success/50 hover:text-success' },
  { key: 'retry', label: 'Retry', icon: RefreshCw, needsDate: true,
    active: 'border-warn bg-warn/10 text-warn', idle: 'hover:border-warn/50 hover:text-warn' },
  { key: 'reschedule', label: 'Reschedule', icon: CalendarClock, needsDate: true,
    active: 'border-accent bg-accent/10 text-accent', idle: 'hover:border-accent/50 hover:text-accent' },
  { key: 'denied', label: 'Denied', icon: XCircle, needsDate: false,
    active: 'border-danger bg-danger/10 text-danger', idle: 'hover:border-danger/50 hover:text-danger' },
];

export default function ClaimDispositionControls({ claim, operatorName, onSaved }) {
  const setDisposition = useMutation(api.claimFollowups.setDisposition);
  const [selected, setSelected] = useState(claim?.followUpDisposition ?? null);
  const [comment, setComment] = useState(claim?.followUpComment ?? '');
  const [followUpDate, setFollowUpDate] = useState(claim?.nextFollowUpDate ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  // Re-sync if the underlying claim changes (reactive query refresh).
  useEffect(() => {
    setSelected(claim?.followUpDisposition ?? null);
    setComment(claim?.followUpComment ?? '');
    setFollowUpDate(claim?.nextFollowUpDate ?? '');
  }, [claim?._id, claim?.followUpDisposition, claim?.followUpComment, claim?.nextFollowUpDate]);

  const activeOption = OPTIONS.find((o) => o.key === selected);
  const showDate = !!activeOption?.needsDate;

  async function handleSave() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await setDisposition({
        claimId: claim._id,
        disposition: selected,
        comment: comment.trim() || undefined,
        nextFollowUpDate: showDate && followUpDate ? followUpDate : undefined,
        operatorName: operatorName || undefined,
      });
      if (res?.ok) {
        setSavedAt(Date.now());
        onSaved?.(selected);
      } else {
        setError('Could not save — please retry');
      }
    } catch (e) {
      setError(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/70 mb-2">
          Next action
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {OPTIONS.map(({ key, label, icon: Icon, active, idle }) => {
            const isActive = selected === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setSelected(key); setSavedAt(null); }}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  isActive ? active : `border-border text-gray-600 bg-white ${idle}`
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {showDate && (
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/70">
            {selected === 'reschedule' ? 'Reschedule for' : 'Next attempt on'}
          </label>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => { setFollowUpDate(e.target.value); setSavedAt(null); }}
            className="mt-1 block w-full sm:w-56 rounded-lg border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      )}

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/70">
          Comment
        </label>
        <textarea
          value={comment}
          onChange={(e) => { setComment(e.target.value); setSavedAt(null); }}
          rows={2}
          placeholder="Add a note about this claim (what the rep said, reference #, next steps…)"
          className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-900 placeholder:text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent resize-y"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={!selected || saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save disposition
        </button>
        {savedAt && !saving && (
          <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
