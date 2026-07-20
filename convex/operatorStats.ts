import { query } from './_generated/server';
import { v } from 'convex/values';

const STALE_LIVE_MS = 2 * 60 * 60 * 1000;

function isStaleLiveCall(call: any): boolean {
  if (!call.startedAt) return false;
  return Date.now() - new Date(call.startedAt).getTime() > STALE_LIVE_MS;
}

function wasHandled(call: any): boolean {
  return ['accepting', 'connected', 'handoff_ended'].includes(call.handoffState);
}

function isCurrentlyActive(call: any): boolean {
  if (call.status === 'completed' || call.status === 'failed') return false;
  if (isStaleLiveCall(call)) return false;
  return ['awaiting_human', 'accepting', 'connected'].includes(call.handoffState);
}

// One operator's own handoff stats + recent call history — powers
// OperatorDashboardPage. Same "no real backend auth" constraint as
// handoff.getMyRoutingStatus: the caller passes their own userId explicitly.
export const getStats = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_assignedAgentUserId', (q) => q.eq('assignedAgentUserId', args.userId))
      .order('desc')
      .collect();

    const handled = calls.filter(wasHandled);
    const today = new Date().toISOString().split('T')[0];
    const handledToday = handled.filter((c) => (c.handoffAcceptedAt || c.startedAt || '').startsWith(today));

    const durations = handled
      .filter((c) => c.handoffAcceptedAt)
      .map((c) => {
        const start = new Date(c.handoffAcceptedAt).getTime();
        const end = c.completedAt ? new Date(c.completedAt).getTime() : Date.now();
        return Math.max(0, Math.round((end - start) / 1000));
      });
    const avgHandleTimeSeconds = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    const isCurrentlyOnCall = calls.some(isCurrentlyActive);

    const recent = [];
    for (const c of handled.slice(0, 10)) {
      let insuranceCompany: string | null = null;
      let subject = 'Verification call';
      if (c.claimId) {
        const claim = await ctx.db.get(c.claimId);
        if (claim) {
          subject = `Claim ${claim.claimNumber}`;
          const insurance = await ctx.db.get(claim.insuranceContactId);
          insuranceCompany = insurance?.name ?? null;
        }
      } else if (c.dentalCaseId) {
        const dCase = await ctx.db.get(c.dentalCaseId);
        if (dCase) {
          subject = `Case ${dCase.caseNumber}`;
          const insurance = await ctx.db.get(dCase.insuranceContactId);
          insuranceCompany = insurance?.name ?? null;
        }
      } else {
        const insurance = await ctx.db.get(c.insuranceContactId);
        insuranceCompany = insurance?.name ?? null;
      }
      recent.push({
        callId: c._id,
        insuranceCompany,
        subject,
        handoffState: c.handoffState,
        handoffAcceptedAt: c.handoffAcceptedAt,
        completedAt: c.completedAt,
      });
    }

    return {
      totalHandled: handled.length,
      handledToday: handledToday.length,
      avgHandleTimeSeconds,
      isCurrentlyOnCall,
      recent,
    };
  },
});
