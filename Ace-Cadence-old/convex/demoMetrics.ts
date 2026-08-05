import { mutation } from './_generated/server';

const DEMO_PREFIX = 'demo-hold-metric-';
const USER_ID = 'default';

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function completedAt(startedAt: string, durationSeconds: number): string {
  return new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
}

function choosePayers(contacts: any[]) {
  const preferred = [
    'Mass Mutual',
    'Aetna',
    'Cigna Healthcare',
    'UnitedHealthcare',
    'BCBS',
    'Humana',
  ];
  const selected: any[] = [];
  for (const name of preferred) {
    const match = contacts.find((contact) => contact.name === name);
    if (match && !selected.some((contact) => contact._id === match._id)) selected.push(match);
  }
  for (const contact of contacts) {
    if (selected.length >= 5) break;
    if (!selected.some((item) => item._id === contact._id)) selected.push(contact);
  }
  return selected.slice(0, 5);
}

// Production demo seed for Reports > Hold Metrics.
// Idempotent: removes only calls with our demo Twilio SID prefix, then inserts
// fresh recent completed calls. Real calls are never touched and naturally roll
// into the same reports.holdMetrics aggregates as soon as Convex records them.
export const seedHoldMetrics = mutation({
  args: {},
  handler: async (ctx) => {
    const allCalls = await ctx.db.query('calls').collect();
    let removed = 0;
    for (const call of allCalls) {
      if (call.twilioCallSid?.startsWith(DEMO_PREFIX)) {
        await ctx.db.delete(call._id);
        removed++;
      }
    }

    const contacts = await ctx.db.query('insuranceContacts').collect();
    const payers = choosePayers(contacts.filter((contact) => contact.userId === USER_ID));
    if (payers.length === 0) {
      return { seeded: 0, removed, reason: 'no insurance contacts found for default user' };
    }

    const holdProfiles = [
      { payerIndex: 0, hold: 720, duration: 1040, outcome: 'successful' },
      { payerIndex: 0, hold: 540, duration: 860, outcome: 'successful' },
      { payerIndex: 0, hold: 960, duration: 1320, outcome: 'partial' },
      { payerIndex: 1, hold: 480, duration: 780, outcome: 'successful' },
      { payerIndex: 1, hold: 660, duration: 980, outcome: 'successful' },
      { payerIndex: 1, hold: 1260, duration: 1660, outcome: 'transferred_to_human' },
      { payerIndex: 2, hold: 300, duration: 620, outcome: 'successful' },
      { payerIndex: 2, hold: 420, duration: 780, outcome: 'successful' },
      { payerIndex: 3, hold: 840, duration: 1160, outcome: 'partial' },
      { payerIndex: 3, hold: 390, duration: 690, outcome: 'successful' },
      { payerIndex: 4, hold: 1080, duration: 1480, outcome: 'transferred_to_human' },
      { payerIndex: 4, hold: 240, duration: 540, outcome: 'successful' },
    ];

    let seeded = 0;
    for (let i = 0; i < holdProfiles.length; i++) {
      const profile = holdProfiles[i];
      const payer = payers[profile.payerIndex % payers.length];
      const startedAt = isoMinutesAgo(35 + i * 48);
      await ctx.db.insert('calls', {
        insuranceContactId: payer._id,
        useCase: 'medical_claim',
        status: 'completed',
        twilioCallSid: `${DEMO_PREFIX}${String(i + 1).padStart(2, '0')}`,
        duration: profile.duration,
        transcript: 'Demo reporting baseline: IVR navigation, payer hold queue, representative connected, claim status documented.',
        callPhase: 'completed',
        holdStartedAt: new Date(new Date(startedAt).getTime() + 90 * 1000).toISOString(),
        holdDuration: profile.hold,
        humanDetectedAt: new Date(new Date(startedAt).getTime() + (profile.hold + 95) * 1000).toISOString(),
        outcome: profile.outcome,
        outcomeReason: 'demo_hold_metrics_seed',
        userId: USER_ID,
        startedAt,
        completedAt: completedAt(startedAt, profile.duration),
      });
      seeded++;
    }

    return {
      seeded,
      removed,
      payers: payers.map((payer) => payer.name),
      note: 'Hold Metrics now uses seeded DB calls plus any real calls created during the demo.',
    };
  },
});
