import { mutation, query, action, internalMutation, internalAction, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

const RETRY_BACKOFF_SECONDS = [60, 300, 1800, 7200, 28800, 86400, 172800, 345600];
const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

function randomHex(byteCount: number): string {
  const buf = new Uint8Array(byteCount);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

async function buildSignature(secret: string, payload: string, timestamp: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload + ':' + timestamp));
  return bytesToHex(new Uint8Array(sig));
}

export const subscribe = mutation({
  args: {
    url: v.string(),
    events: v.array(v.string()),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.url.startsWith('https://')) {
      throw new Error('Webhook URL must use https://');
    }
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const secret = args.secret ?? randomHex(16); // 32 hex chars
    return await ctx.db.insert('webhookSubscriptions', {
      url: args.url,
      events: args.events,
      secret,
      status: 'active',
      failureCount: 0,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db
      .query('webhookSubscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const update = mutation({
  args: {
    id: v.id('webhookSubscriptions'),
    url: v.optional(v.string()),
    events: v.optional(v.array(v.string())),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.url && !args.url.startsWith('https://')) {
      throw new Error('Webhook URL must use https://');
    }
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const pause = mutation({
  args: { id: v.id('webhookSubscriptions') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: 'paused' });
  },
});

export const resume = mutation({
  args: { id: v.id('webhookSubscriptions') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: 'active' });
  },
});

export const revoke = mutation({
  args: { id: v.id('webhookSubscriptions') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: 'revoked' });
  },
});

// Test fire: synthesize a test payload, schedule one immediate delivery
export const testFire = action({
  args: { id: v.id('webhookSubscriptions') },
  handler: async (ctx, args): Promise<{ deliveryId: string }> => {
    const sub = await ctx.runQuery(internal.webhooks._getSubscription, { id: args.id });
    if (!sub) throw new Error('Subscription not found');

    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      payload: { message: 'hello' },
    };

    const deliveryId = await ctx.runMutation(internal.webhooks._createDelivery, {
      subscriptionId: args.id,
      eventType: 'test',
      eventPayload: JSON.stringify(payload),
      attempt: 1,
    });

    await ctx.runAction(internal.webhooks.deliverNext, { deliveryId });
    return { deliveryId };
  },
});

// Per-subscription delivery history
export const listDeliveries = query({
  args: {
    subscriptionId: v.id('webhookSubscriptions'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const all = await ctx.db
      .query('webhookDeliveries')
      .withIndex('by_subscriptionId', (q) => q.eq('subscriptionId', args.subscriptionId))
      .order('desc')
      .collect();
    return all.slice(0, limit);
  },
});

// Internal: dispatch an event to all matching active subscriptions
export const dispatchEvent = internalAction({
  args: {
    eventType: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const subs = await ctx.runQuery(internal.webhooks._getActiveSubscriptionsForEvent, {
      eventType: args.eventType,
    });
    const enriched = {
      event: args.eventType,
      timestamp: new Date().toISOString(),
      payload: args.payload,
    };
    for (const sub of subs) {
      const deliveryId = await ctx.runMutation(internal.webhooks._createDelivery, {
        subscriptionId: sub._id,
        eventType: args.eventType,
        eventPayload: JSON.stringify(enriched),
        attempt: 1,
      });
      await ctx.runAction(internal.webhooks.deliverNext, { deliveryId });
    }
  },
});

// Internal helpers (queries/mutations consumed by the actions)
export const _getSubscription = internalQuery({
  args: { id: v.id('webhookSubscriptions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const _getActiveSubscriptionsForEvent = internalQuery({
  args: { eventType: v.string() },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query('webhookSubscriptions')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect();
    return active.filter((s) => s.events.includes(args.eventType) || s.events.includes('*'));
  },
});

export const _createDelivery = internalMutation({
  args: {
    subscriptionId: v.id('webhookSubscriptions'),
    eventType: v.string(),
    eventPayload: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('webhookDeliveries', {
      subscriptionId: args.subscriptionId,
      eventType: args.eventType,
      eventPayload: args.eventPayload,
      attempt: args.attempt,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  },
});

export const _getDelivery = internalQuery({
  args: { id: v.id('webhookDeliveries') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const _completeDelivery = internalMutation({
  args: {
    id: v.id('webhookDeliveries'),
    status: v.string(),
    httpStatus: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    nextAttemptAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const patch: Record<string, unknown> = {
      ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)),
    };
    if (args.status === 'delivered' || args.status === 'dead_letter') {
      patch.completedAt = new Date().toISOString();
    }
    await ctx.db.patch(id, patch);
  },
});

export const _updateSubscriptionStatus = internalMutation({
  args: {
    id: v.id('webhookSubscriptions'),
    lastDeliveryStatus: v.string(),
    failureCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastDeliveryAt: new Date().toISOString(),
      lastDeliveryStatus: args.lastDeliveryStatus,
      failureCount: args.failureCount,
    });
  },
});

// deliverNext: HMAC-sign, POST. 2xx → delivered. 4xx (except 429) → dead-letter immediate.
// 5xx/429 → schedule retry with backoff. After 8 attempts → dead-letter + bump failureCount.
export const deliverNext = internalAction({
  args: { deliveryId: v.id('webhookDeliveries') },
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.webhooks._getDelivery, { id: args.deliveryId });
    if (!delivery) return;
    const sub = await ctx.runQuery(internal.webhooks._getSubscription, { id: delivery.subscriptionId });
    if (!sub || sub.status !== 'active') {
      await ctx.runMutation(internal.webhooks._completeDelivery, {
        id: args.deliveryId,
        status: 'dead_letter',
        responseBody: 'Subscription is not active',
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const signature = await buildSignature(sub.secret, delivery.eventPayload, timestamp);

    let httpStatus = 0;
    let responseBody = '';
    let success = false;
    let isClientErr = false;
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cadence-Signature': `sha256=${signature}`,
          'X-Cadence-Timestamp': timestamp,
          'X-Cadence-Event': delivery.eventType,
          'X-Cadence-Delivery-Id': args.deliveryId,
          'X-Cadence-Attempt': String(delivery.attempt),
        },
        body: delivery.eventPayload,
      });
      httpStatus = res.status;
      responseBody = (await res.text()).slice(0, 1000);
      success = res.status >= 200 && res.status < 300;
      // 4xx (except 429) is a client error — don't retry
      isClientErr = res.status >= 400 && res.status < 500 && res.status !== 429;
    } catch (err: any) {
      responseBody = `fetch error: ${err?.message ?? String(err)}`.slice(0, 1000);
    }

    if (success) {
      await ctx.runMutation(internal.webhooks._completeDelivery, {
        id: args.deliveryId,
        status: 'delivered',
        httpStatus,
        responseBody,
      });
      await ctx.runMutation(internal.webhooks._updateSubscriptionStatus, {
        id: delivery.subscriptionId,
        lastDeliveryStatus: 'delivered',
        failureCount: 0,
      });
      return;
    }

    // 4xx client error → dead-letter immediately, no retry
    if (isClientErr) {
      await ctx.runMutation(internal.webhooks._completeDelivery, {
        id: args.deliveryId,
        status: 'dead_letter',
        httpStatus,
        responseBody,
      });
      await ctx.runMutation(internal.webhooks._updateSubscriptionStatus, {
        id: delivery.subscriptionId,
        lastDeliveryStatus: 'dead_letter',
        failureCount: (sub.failureCount ?? 0) + 1,
      });
      return;
    }

    // 5xx / 429 / network error → retry path
    if (delivery.attempt >= MAX_ATTEMPTS) {
      await ctx.runMutation(internal.webhooks._completeDelivery, {
        id: args.deliveryId,
        status: 'dead_letter',
        httpStatus,
        responseBody,
      });
      await ctx.runMutation(internal.webhooks._updateSubscriptionStatus, {
        id: delivery.subscriptionId,
        lastDeliveryStatus: 'dead_letter',
        failureCount: (sub.failureCount ?? 0) + 1,
      });
      return;
    }

    const backoffSec = RETRY_BACKOFF_SECONDS[delivery.attempt - 1];
    const nextAt = new Date(Date.now() + backoffSec * 1000).toISOString();

    await ctx.runMutation(internal.webhooks._completeDelivery, {
      id: args.deliveryId,
      status: 'retrying',
      httpStatus,
      responseBody,
      nextAttemptAt: nextAt,
    });
    await ctx.runMutation(internal.webhooks._updateSubscriptionStatus, {
      id: delivery.subscriptionId,
      lastDeliveryStatus: 'retrying',
      failureCount: (sub.failureCount ?? 0) + 1,
    });

    const nextDeliveryId = await ctx.runMutation(internal.webhooks._createDelivery, {
      subscriptionId: delivery.subscriptionId,
      eventType: delivery.eventType,
      eventPayload: delivery.eventPayload,
      attempt: delivery.attempt + 1,
    });
    await ctx.scheduler.runAfter(backoffSec * 1000, internal.webhooks.deliverNext, {
      deliveryId: nextDeliveryId,
    });
  },
});
