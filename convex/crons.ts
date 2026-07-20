import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// TEMPORARILY DISABLED — 2026-07-20 incident: this cron's backfill scope was
// too wide (any completed call ever missing a transcript, no age limit), and
// it swept up a 3-day-old backlog. Backfilling those old calls' transcripts
// triggered analyzeTranscript's "place one follow-up call to the human-agent
// number" logic for each one, which placed real live phone calls today for
// calls that actually happened days ago. Re-enable only after
// listCallsNeedingTranscriptBackfill is bounded to a recent window AND the
// follow-up-call placement itself refuses to fire for stale calls.
//
// crons.interval(
//   'finalize stale in-progress calls',
//   { minutes: 1 },
//   internal.callActions.finalizeStaleInProgressCalls
// );

export default crons;
