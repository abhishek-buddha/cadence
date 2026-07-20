import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// See callActions.finalizeStaleInProgressCalls for why this exists: without
// it, a call's transcript only gets saved if a browser tab happens to be
// open and polling when the call finishes, or if the ElevenLabs webhook
// fires. This closes that gap independent of any browser being open.
crons.interval(
  'finalize stale in-progress calls',
  { minutes: 1 },
  internal.callActions.finalizeStaleInProgressCalls
);

export default crons;
