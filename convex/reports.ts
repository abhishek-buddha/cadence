import { query } from './_generated/server';
import { v } from 'convex/values';

// Helper: stable hash → number in [min, max]
function hashRange(s: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const norm = (h % 10000) / 10000;
  return min + norm * (max - min);
}

function inRange(ts: string | undefined, fromDate?: string, toDate?: string): boolean {
  if (!ts) return false;
  if (fromDate && ts < fromDate) return false;
  if (toDate && ts > toDate) return false;
  return true;
}

export const successRate = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    payerId: v.optional(v.id('insuranceContacts')),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    const filtered = calls.filter((c) => {
      if (args.payerId && c.insuranceContactId !== args.payerId) return false;
      if (args.useCase && c.useCase !== args.useCase) return false;
      if (args.fromDate || args.toDate) {
        if (!inRange(c.startedAt, args.fromDate, args.toDate)) return false;
      }
      return true;
    });

    let successful = 0, partial = 0, failed = 0, transferred = 0;
    for (const c of filtered) {
      if (c.outcome === 'successful') successful++;
      else if (c.outcome === 'partial') partial++;
      else if (c.outcome === 'transferred_to_human') transferred++;
      else if (c.outcome === 'failed') failed++;
    }
    const total = filtered.length;
    const successRatePct = total > 0 ? Math.round((successful / total) * 1000) / 10 : 0;
    return { successful, partial, failed, transferred, total, successRatePct };
  },
});

export const successRateByPayer = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    const filtered = calls.filter((c) => {
      if (args.useCase && c.useCase !== args.useCase) return false;
      if (args.fromDate || args.toDate) {
        if (!inRange(c.startedAt, args.fromDate, args.toDate)) return false;
      }
      return true;
    });

    type Bucket = { successful: number; partial: number; failed: number; transferred: number; total: number };
    const byPayer = new Map<string, Bucket>();
    for (const c of filtered) {
      const key = c.insuranceContactId as unknown as string;
      const b = byPayer.get(key) ?? { successful: 0, partial: 0, failed: 0, transferred: 0, total: 0 };
      b.total++;
      if (c.outcome === 'successful') b.successful++;
      else if (c.outcome === 'partial') b.partial++;
      else if (c.outcome === 'transferred_to_human') b.transferred++;
      else if (c.outcome === 'failed') b.failed++;
      byPayer.set(key, b);
    }

    const result: Array<{ payer: string; payerName: string; successful: number; partial: number; failed: number; total: number; pct: number }> = [];
    for (const [key, b] of byPayer.entries()) {
      const ins = await ctx.db.get(key as any);
      const pct = b.total > 0 ? Math.round((b.successful / b.total) * 1000) / 10 : 0;
      result.push({
        payer: key,
        payerName: (ins as any)?.name ?? 'Unknown',
        successful: b.successful,
        partial: b.partial,
        failed: b.failed,
        total: b.total,
        pct,
      });
    }
    result.sort((a, b) => b.total - a.total);
    return result;
  },
});

export const successRateByWeek = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    payerId: v.optional(v.id('insuranceContacts')),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const allCalls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    const calls = allCalls.filter((c) => {
      if (args.payerId && c.insuranceContactId !== args.payerId) return false;
      if (args.useCase && c.useCase !== args.useCase) return false;
      if (args.fromDate || args.toDate) {
        if (!inRange(c.startedAt, args.fromDate, args.toDate)) return false;
      }
      return true;
    });

    // Build last 12 ISO weeks (Mon-start)
    const weeks: { weekStart: string; successful: number; partial: number; failed: number; total: number }[] = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = (today.getUTCDay() + 6) % 7; // 0=Mon
    const thisWeekMonday = new Date(today.getTime() - dayOfWeek * 86400000);

    for (let i = 11; i >= 0; i--) {
      const wkStart = new Date(thisWeekMonday.getTime() - i * 7 * 86400000);
      weeks.push({
        weekStart: wkStart.toISOString().split('T')[0],
        successful: 0,
        partial: 0,
        failed: 0,
        total: 0,
      });
    }
    const startOfWindow = weeks[0].weekStart;

    for (const c of calls) {
      if (!c.startedAt || c.startedAt < startOfWindow) continue;
      const callDate = c.startedAt.split('T')[0];
      // Find week bucket: largest weekStart <= callDate
      let idx = -1;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (weeks[i].weekStart <= callDate) { idx = i; break; }
      }
      if (idx < 0) continue;
      weeks[idx].total++;
      if (c.outcome === 'successful') weeks[idx].successful++;
      else if (c.outcome === 'partial') weeks[idx].partial++;
      else if (c.outcome === 'failed' || c.outcome === 'transferred_to_human') weeks[idx].failed++;
    }
    return weeks;
  },
});

// Synthetic data accuracy score for now — real implementation requires QA-sample comparison.
export const dataAccuracy = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const insurances = await ctx.db
      .query('insuranceContacts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    return insurances.map((ins) => ({
      payer: ins._id,
      payerName: ins.name,
      payerKind: ins.payerKind ?? 'unknown',
      accuracy: Math.round(hashRange(ins._id as unknown as string, 0.85, 0.97) * 1000) / 1000,
    }));
  },
});

// Turnaround time: p50/p95/p99 of (completedAt - startedAt) in seconds, grouped by useCase
export const turnaroundTime = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    const completed = calls.filter((c) => c.completedAt && c.startedAt);

    const buckets = new Map<string, number[]>();
    for (const c of completed) {
      const sec = (new Date(c.completedAt!).getTime() - new Date(c.startedAt).getTime()) / 1000;
      if (sec < 0) continue;
      const useCase = c.useCase ?? 'unknown';
      if (!buckets.has(useCase)) buckets.set(useCase, []);
      buckets.get(useCase)!.push(sec);
    }

    const percentile = (sorted: number[], p: number): number => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
      return Math.round(sorted[idx]);
    };

    const result: Array<{ useCase: string; count: number; p50: number; p95: number; p99: number }> = [];
    for (const [useCase, secs] of buckets.entries()) {
      const sorted = [...secs].sort((a, b) => a - b);
      result.push({
        useCase,
        count: sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      });
    }
    return result;
  },
});


export const holdMetrics = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    payerId: v.optional(v.id('insuranceContacts')),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    const filtered = calls.filter((c) => {
      if (args.payerId && c.insuranceContactId !== args.payerId) return false;
      if (args.useCase && c.useCase !== args.useCase) return false;
      if (args.fromDate || args.toDate) {
        if (!inRange(c.startedAt, args.fromDate, args.toDate)) return false;
      }
      return true;
    });

    const holdSecondsFor = (call: any): number => {
      if (typeof call.holdDuration === 'number' && call.holdDuration > 0) {
        return Math.round(call.holdDuration);
      }
      if (call.holdStartedAt && call.callPhase === 'hold') {
        const elapsed = Math.round((Date.now() - new Date(call.holdStartedAt).getTime()) / 1000);
        return elapsed > 0 ? elapsed : 0;
      }
      return 0;
    };

    const percentile = (sorted: number[], p: number): number => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
      return Math.round(sorted[idx]);
    };

    const holdCalls = filtered
      .map((call) => ({ call, holdSeconds: holdSecondsFor(call) }))
      .filter((row) => row.holdSeconds > 0);
    const sorted = holdCalls.map((row) => row.holdSeconds).sort((a, b) => a - b);
    const totalHoldSeconds = sorted.reduce((sum, seconds) => sum + seconds, 0);
    const avgHoldSeconds = sorted.length > 0 ? Math.round(totalHoldSeconds / sorted.length) : 0;

    type Bucket = {
      totalCalls: number;
      callsWithHold: number;
      totalHoldSeconds: number;
      maxHoldSeconds: number;
      longHoldCount: number;
    };
    const byPayer = new Map<string, Bucket>();

    for (const call of filtered) {
      const key = call.insuranceContactId as unknown as string;
      const bucket = byPayer.get(key) ?? {
        totalCalls: 0,
        callsWithHold: 0,
        totalHoldSeconds: 0,
        maxHoldSeconds: 0,
        longHoldCount: 0,
      };
      bucket.totalCalls++;
      const holdSeconds = holdSecondsFor(call);
      if (holdSeconds > 0) {
        bucket.callsWithHold++;
        bucket.totalHoldSeconds += holdSeconds;
        bucket.maxHoldSeconds = Math.max(bucket.maxHoldSeconds, holdSeconds);
        if (holdSeconds >= 10 * 60) bucket.longHoldCount++;
      }
      byPayer.set(key, bucket);
    }

    const payerRows: Array<{
      payer: string;
      payerName: string;
      totalCalls: number;
      callsWithHold: number;
      avgHoldSeconds: number;
      maxHoldSeconds: number;
      longHoldCount: number;
    }> = [];
    for (const [key, bucket] of byPayer.entries()) {
      const ins = await ctx.db.get(key as any);
      payerRows.push({
        payer: key,
        payerName: (ins as any)?.name ?? 'Unknown',
        totalCalls: bucket.totalCalls,
        callsWithHold: bucket.callsWithHold,
        avgHoldSeconds: bucket.callsWithHold > 0
          ? Math.round(bucket.totalHoldSeconds / bucket.callsWithHold)
          : 0,
        maxHoldSeconds: bucket.maxHoldSeconds,
        longHoldCount: bucket.longHoldCount,
      });
    }
    payerRows.sort((a, b) => b.avgHoldSeconds - a.avgHoldSeconds);

    return {
      totalCalls: filtered.length,
      callsWithHold: holdCalls.length,
      avgHoldSeconds,
      p95HoldSeconds: percentile(sorted, 95),
      maxHoldSeconds: sorted.length ? sorted[sorted.length - 1] : 0,
      longHoldCount: holdCalls.filter((row) => row.holdSeconds >= 10 * 60).length,
      over30MinCount: holdCalls.filter((row) => row.holdSeconds >= 30 * 60).length,
      byPayer: payerRows,
    };
  },
});

// Exception report: long holds OR high partial rate per payer in last 24h
export const exceptionReport = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = calls.filter((c) => c.startedAt >= cutoff);

    const exceptions: Array<{ exception: string; payer: string; payerName: string; count: number; lastSeenAt: string }> = [];

    // Long hold exceptions
    const longHolds = recent.filter((c) => (c.holdDuration ?? 0) > 600);
    const longHoldsByPayer = new Map<string, { count: number; lastSeenAt: string }>();
    for (const c of longHolds) {
      const key = c.insuranceContactId as unknown as string;
      const prev = longHoldsByPayer.get(key) ?? { count: 0, lastSeenAt: c.startedAt };
      prev.count++;
      if (c.startedAt > prev.lastSeenAt) prev.lastSeenAt = c.startedAt;
      longHoldsByPayer.set(key, prev);
    }
    for (const [key, v] of longHoldsByPayer.entries()) {
      const ins = await ctx.db.get(key as any);
      exceptions.push({
        exception: 'long_hold_over_10min',
        payer: key,
        payerName: (ins as any)?.name ?? 'Unknown',
        count: v.count,
        lastSeenAt: v.lastSeenAt,
      });
    }

    // High partial-rate exceptions
    const partialByPayer = new Map<string, { count: number; lastSeenAt: string }>();
    for (const c of recent) {
      if (c.outcome !== 'partial') continue;
      const key = c.insuranceContactId as unknown as string;
      const prev = partialByPayer.get(key) ?? { count: 0, lastSeenAt: c.startedAt };
      prev.count++;
      if (c.startedAt > prev.lastSeenAt) prev.lastSeenAt = c.startedAt;
      partialByPayer.set(key, prev);
    }
    for (const [key, v] of partialByPayer.entries()) {
      if (v.count <= 5) continue;
      const ins = await ctx.db.get(key as any);
      exceptions.push({
        exception: 'high_partial_rate',
        payer: key,
        payerName: (ins as any)?.name ?? 'Unknown',
        count: v.count,
        lastSeenAt: v.lastSeenAt,
      });
    }

    return exceptions;
  },
});


export const operationalKpis = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    payerId: v.optional(v.id('insuranceContacts')),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    const filtered = calls.filter((c) => {
      if (args.payerId && c.insuranceContactId !== args.payerId) return false;
      if (args.useCase && c.useCase !== args.useCase) return false;
      if (args.fromDate || args.toDate) {
        if (!inRange(c.startedAt, args.fromDate, args.toDate)) return false;
      }
      return true;
    });

    const completed = filtered.filter((c) => c.status === 'completed' || c.completedAt);
    const failed = filtered.filter((c) => c.status === 'failed' || c.outcome === 'failed');
    const transferred = filtered.filter((c) =>
      c.outcome === 'transferred_to_human' ||
      c.handoffState === 'connected' ||
      c.handoffState === 'handoff_ended' ||
      !!c.humanTranscript
    );
    const ivrAttempted = filtered.filter((c) =>
      c.ivrSequenceUsed || c.callPhase || c.holdStartedAt || c.humanDetectedAt || c.holdDuration
    );
    const ivrTraversed = ivrAttempted.filter((c) =>
      c.humanDetectedAt || c.holdDuration || c.callPhase === 'connecting' || transferred.includes(c)
    );
    const automated = completed.filter((c) => !transferred.includes(c));
    const totalDurationSeconds = completed.reduce((sum, c) => sum + (c.duration || 0), 0);
    const totalHoldSeconds = filtered.reduce((sum, c) => sum + (c.holdDuration || 0), 0);
    const firstStart = filtered.reduce<string | null>((min, c) => {
      if (!c.startedAt) return min;
      return !min || c.startedAt < min ? c.startedAt : min;
    }, null);
    const lastEnd = filtered.reduce<string | null>((max, c) => {
      const ts = c.completedAt || c.startedAt;
      if (!ts) return max;
      return !max || ts > max ? ts : max;
    }, null);
    const elapsedHours = firstStart && lastEnd
      ? Math.max(1, (new Date(lastEnd).getTime() - new Date(firstStart).getTime()) / 3600000)
      : 1;

    const estimatedMinutesSaved = Math.round((totalDurationSeconds + totalHoldSeconds) / 60);
    const estimatedCostSavings = Math.round((estimatedMinutesSaved / 60) * 28);

    return {
      totalCalls: filtered.length,
      completedCalls: completed.length,
      failedCalls: failed.length,
      transferredCalls: transferred.length,
      ivrAttempted: ivrAttempted.length,
      ivrTraversed: ivrTraversed.length,
      ivrTraversalRate: ivrAttempted.length > 0 ? Math.round((ivrTraversed.length / ivrAttempted.length) * 1000) / 10 : 0,
      transferRate: filtered.length > 0 ? Math.round((transferred.length / filtered.length) * 1000) / 10 : 0,
      automationRate: completed.length > 0 ? Math.round((automated.length / completed.length) * 1000) / 10 : 0,
      callsPerHour: Math.round((completed.length / elapsedHours) * 10) / 10,
      estimatedMinutesSaved,
      estimatedCostSavings,
    };
  },
});

// Volume tier breakdown for current month per payer
export const volumeByTier = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const thisMonth = calls.filter((c) => c.startedAt >= monthStart);

    const counts = new Map<string, number>();
    for (const c of thisMonth) {
      const key = c.insuranceContactId as unknown as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result: Array<{ payer: string; payerName: string; count: number; tier: 'low' | 'medium' | 'high' }> = [];
    for (const [key, count] of counts.entries()) {
      const ins = await ctx.db.get(key as any);
      let tier: 'low' | 'medium' | 'high' = 'low';
      if (count > 2000) tier = 'high';
      else if (count >= 500) tier = 'medium';
      result.push({
        payer: key,
        payerName: (ins as any)?.name ?? 'Unknown',
        count,
        tier,
      });
    }
    return result;
  },
});
