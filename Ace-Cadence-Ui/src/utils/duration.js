// Call duration formatting, shared by every screen that shows one.
//
// `calls.duration` is a FLOAT column (db/schema.sql:239), so it arrives as e.g.
// 180.0 — and for a non-integer value the naive `seconds % 60` renders as
// "03:5.400000000000034". Round once, here, rather than at each call site.
//
// Previously CallHistory.jsx and LiveCallsPage.jsx each carried their own
// identical copy of both helpers.

export function formatDuration(seconds) {
  if (seconds == null) return '--:--';
  const total = Math.max(0, Math.round(Number(seconds)));
  if (!Number.isFinite(total)) return '--:--';
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Prefer the stored duration; fall back to the started -> completed span for
// calls closed by a signal that carried no duration.
export function callDuration(call) {
  if (call?.duration != null && call.duration > 0) return Math.round(Number(call.duration));
  if (call?.startedAt && call?.completedAt) {
    const span = (new Date(call.completedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
    return Number.isFinite(span) ? Math.max(0, Math.round(span)) : null;
  }
  return null;
}
