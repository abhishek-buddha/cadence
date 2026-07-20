import { cronJobs } from 'convex/server';

// No scheduled jobs. (A transcript-backfill cron once lived here; it swept the
// entire call history and re-triggered real follow-up calls for days-old calls
// — see the 2026-07-20 incident. Transcript/recording storage now happens
// inline at the moment each call ends, per call, via the end-of-call paths in
// callActions.ts and http.ts — no sweeping.)
const crons = cronJobs();

export default crons;
