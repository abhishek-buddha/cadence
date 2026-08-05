import { query, action } from './_generated/server';
import { v } from 'convex/values';

function inRange(date: string | undefined, fromDate?: string, toDate?: string): boolean {
  if (!date) return false;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

export const getStats = query({
  args: {
    providerId: v.optional(v.id('providers')),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';

    let allClaims = await ctx.db
      .query('claims')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    // Filter by provider if specified
    if (args.providerId) {
      allClaims = allClaims.filter((c) => c.providerId === args.providerId);
    }
    // Filter by date of service if a range was given
    if (args.fromDate || args.toDate) {
      allClaims = allClaims.filter((c) => inRange(c.dateOfService, args.fromDate, args.toDate));
    }

    const claimIds = new Set(allClaims.map((c) => c._id));

    const pendingClaims = allClaims.filter((c) => c.status === 'pending').length;
    const inProgressClaims = allClaims.filter((c) => c.status === 'in_progress').length;
    const paidClaims = allClaims.filter((c) => c.status === 'paid');
    const deniedClaims = allClaims.filter((c) => c.status === 'denied').length;

    const today = new Date().toISOString().split('T')[0];
    let allCalls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    // Filter calls to only those belonging to filtered claims
    if (args.providerId) {
      allCalls = allCalls.filter((c) => c.claimId !== undefined && claimIds.has(c.claimId));
    }
    // Filter calls by their own start date if a range was given
    if (args.fromDate || args.toDate) {
      allCalls = allCalls.filter((c) => inRange(c.startedAt?.split('T')[0], args.fromDate, args.toDate));
    }

    const callsToday = allCalls.filter((c) => c.startedAt.startsWith(today)).length;
    const completedCalls = allCalls.filter((c) => c.status === 'completed').length;

    const totalBilled = allClaims.reduce((sum, c) => sum + c.amount, 0);
    const recoveredAmount = paidClaims.reduce((sum, c) => sum + c.amount, 0);

    const byAgingBucket = {
      '0-30': allClaims.filter((c) => c.agingBucket === '0-30').length,
      '31-60': allClaims.filter((c) => c.agingBucket === '31-60').length,
      '61-90': allClaims.filter((c) => c.agingBucket === '61-90').length,
      '91-120': allClaims.filter((c) => c.agingBucket === '91-120').length,
      '120+': allClaims.filter((c) => c.agingBucket === '120+').length,
    };

    const byStatus = {
      pending: pendingClaims,
      in_progress: inProgressClaims,
      paid: paidClaims.length,
      denied: deniedClaims,
      appealing: allClaims.filter((c) => c.status === 'appealing').length,
    };

    // RFP requirement: outcome stats for the current week (last 7 days based on
    // startedAt) — but if the caller passed an explicit date range, honor that
    // range instead so "Outcome Distribution" doesn't silently go empty when
    // the picked range falls outside the last 7 days.
    const hasDateFilter = Boolean(args.fromDate || args.toDate);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const outcomeWindowCalls = hasDateFilter ? allCalls : allCalls.filter((c) => c.startedAt >= sevenDaysAgo);
    const outcomeStats = {
      successful: outcomeWindowCalls.filter((c) => c.outcome === 'successful').length,
      partial: outcomeWindowCalls.filter((c) => c.outcome === 'partial').length,
      failed: outcomeWindowCalls.filter((c) => c.outcome === 'failed').length,
      transferred_to_human: outcomeWindowCalls.filter((c) => c.outcome === 'transferred_to_human').length,
    };

    return {
      totalClaims: allClaims.length,
      pendingClaims,
      inProgressClaims,
      callsToday,
      totalCalls: allCalls.length,
      completedCalls,
      successRate:
        allCalls.length > 0 ? Math.round((completedCalls / allCalls.length) * 100) : 0,
      totalBilled,
      recoveredAmount: recoveredAmount || 0,
      byAgingBucket,
      byStatus,
      outcomeStats,
      outcomeWindowIsDateFilter: hasDateFilter,
    };
  },
});

// Last 8 weeks of outcome counts grouped by useCase (RFP reporting requirement).
export const outcomeStatsByWeek = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    // Build last 8 ISO weeks (Monday-start), oldest first
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = (today.getUTCDay() + 6) % 7; // 0 = Mon
    const thisWeekMonday = new Date(today.getTime() - dayOfWeek * 86400000);

    type Bucket = {
      weekStart: string;
      byUseCase: Record<string, { successful: number; partial: number; failed: number; transferred_to_human: number; total: number }>;
    };
    const weeks: Bucket[] = [];
    for (let i = 7; i >= 0; i--) {
      const wkStart = new Date(thisWeekMonday.getTime() - i * 7 * 86400000);
      weeks.push({
        weekStart: wkStart.toISOString().split('T')[0],
        byUseCase: {},
      });
    }
    const startOfWindow = weeks[0].weekStart;

    for (const c of calls) {
      if (!c.startedAt || c.startedAt < startOfWindow) continue;
      const callDate = c.startedAt.split('T')[0];
      let idx = -1;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (weeks[i].weekStart <= callDate) { idx = i; break; }
      }
      if (idx < 0) continue;
      const useCase = c.useCase ?? 'unknown';
      const bucket = weeks[idx].byUseCase[useCase] ?? {
        successful: 0,
        partial: 0,
        failed: 0,
        transferred_to_human: 0,
        total: 0,
      };
      bucket.total++;
      if (c.outcome === 'successful') bucket.successful++;
      else if (c.outcome === 'partial') bucket.partial++;
      else if (c.outcome === 'transferred_to_human') bucket.transferred_to_human++;
      else if (c.outcome === 'failed') bucket.failed++;
      weeks[idx].byUseCase[useCase] = bucket;
    }

    return weeks;
  },
});

export const checkApiConfig = action({
  args: {},
  handler: async () => {
    return {
      openai: !!process.env.OPENAI_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      twilio: !!(process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID),
    };
  },
});

export const validateAccessCode = action({
  args: { code: v.string() },
  handler: async (_, args) => {
    const validCode = process.env.CADENCE_ACCESS_CODE || '472394';
    return { valid: args.code === validCode };
  },
});
