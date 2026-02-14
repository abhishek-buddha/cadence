import { query } from './_generated/server';

export const getStats = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const allClaims = await ctx.db
      .query('claims')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    const pendingClaims = allClaims.filter((c) => c.status === 'pending').length;
    const inProgressClaims = allClaims.filter((c) => c.status === 'in_progress').length;
    const paidClaims = allClaims.filter((c) => c.status === 'paid');
    const deniedClaims = allClaims.filter((c) => c.status === 'denied').length;

    const today = new Date().toISOString().split('T')[0];
    const allCalls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
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
      recoveredAmount,
      byAgingBucket,
      byStatus,
    };
  },
});
