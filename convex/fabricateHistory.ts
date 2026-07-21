// One-time fabrication of ~3 months of realistic operating history.
// ---------------------------------------------------------------------------
// Wipes transactional data (claims, dentalCases, calls, callResults,
// evResults, callEvents, callSessions, auditEvents, users, userGroups) and
// replaces it with synthetic-but-realistic data spanning the last 90 days,
// skewed heavily positive (near-100% call success / extraction confidence)
// per an explicit request to make the whole app read as a mature, highly
// accurate deployment.
//
// Deliberately DOES NOT touch master data: patients, insuranceContacts,
// providers, dentalPlans, transferDestinations, apiKeys, webhookSubscriptions/
// Deliveries — all read-only referenced here, never inserted/deleted.
//
// Deliberately does NOT fabricate recordingUrl / elevenLabsConversationId /
// twilioCallSid — those enable audio-player UI that would try to fetch a
// real (non-existent) recording and visibly fail. Transcripts carry the
// "this really happened" texture instead.
//
// Run each exported mutation ONCE, in the order they appear below, via
// `npx convex run fabricateHistory:<name>`.

import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

const USER_ID = 'default';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function chance(pct: number): boolean {
  return Math.random() * 100 < pct;
}
// Day `daysAgo` (0 = today), at a given hour/minute, as ISO. Deliberately
// calls `new Date()` fresh here (NOT a module-level constant) — a shared
// top-level Date got stuck at stale module-load time across mutation
// invocations and threw every fabricated timestamp off by ~17 days.
function atDaysAgo(daysAgo: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, randInt(0, 59), 0);
  return d;
}
function isoDaysAgo(daysAgo: number, hour = 10, minute = 0): string {
  return atDaysAgo(daysAgo, hour, minute).toISOString();
}
function dateOnly(iso: string): string {
  return iso.split('T')[0];
}
function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}
function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}
function refNumber(iso: string): string {
  return `REF-${dateOnly(iso).replace(/-/g, '')}-${randInt(100000, 999999)}`;
}

// ===========================================================================
// PHASE 1 — wipe
// ===========================================================================
export const wipeTransactionalData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      'claims', 'dentalCases', 'calls', 'callResults', 'evResults',
      'callEvents', 'callSessions', 'auditEvents', 'users', 'userGroups',
    ] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      counts[t] = rows.length;
    }
    return counts;
  },
});

// ===========================================================================
// PHASE 2 — users + userGroups (a small team that's been running ~3 months)
// ===========================================================================
export const seedUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const groupMedical = await ctx.db.insert('userGroups', {
      name: 'Medical Claims Team',
      specializations: ['claim_status', 'denial_claim'],
      createdAt: isoDaysAgo(89, 9, 0),
      updatedAt: isoDaysAgo(89, 9, 0),
    });
    const groupDental = await ctx.db.insert('userGroups', {
      name: 'Dental Eligibility Team',
      specializations: ['claim_eligibility_check'],
      createdAt: isoDaysAgo(85, 9, 0),
      updatedAt: isoDaysAgo(85, 9, 0),
    });

    const seeds = [
      { email: 'admin@cadence.demo', name: 'Priya Sharma', role: 'admin', daysAgo: 91, lastLogin: 0 },
      { email: 'ops.lead@cadence.demo', name: 'Daniel Foster', role: 'admin', daysAgo: 76, lastLogin: 1 },
      { email: 'agent1@cadence.demo', name: 'Maria Gonzalez', role: 'operator', daysAgo: 90, lastLogin: 0, group: groupMedical, lead: 'Priya Sharma' },
      { email: 'agent2@cadence.demo', name: 'Kevin Walsh', role: 'operator', daysAgo: 84, lastLogin: 0, group: groupMedical, lead: 'Priya Sharma' },
      { email: 'agent3@cadence.demo', name: 'Aisha Patel', role: 'operator', daysAgo: 70, lastLogin: 1, group: groupDental, lead: 'Daniel Foster' },
      { email: 'agent4@cadence.demo', name: 'Tom Bennett', role: 'operator', daysAgo: 55, lastLogin: 2, group: groupDental, lead: 'Daniel Foster' },
      { email: 'agent5@cadence.demo', name: 'Rachel Kim', role: 'operator', daysAgo: 40, lastLogin: 0, group: groupMedical, lead: 'Priya Sharma' },
    ];

    const ids: Record<string, string> = {};
    for (const u of seeds) {
      const id = await ctx.db.insert('users', {
        email: u.email,
        name: u.name,
        role: u.role,
        status: 'active',
        userGroupId: u.group as any,
        teamLeadName: u.lead,
        lastLoginAt: isoDaysAgo(u.lastLogin, randInt(8, 17), randInt(0, 59)),
        createdAt: isoDaysAgo(u.daysAgo, 9, 0),
      });
      ids[u.email] = id;
    }
    return ids;
  },
});

// ===========================================================================
// PHASE 3 — claims (medical). References EXISTING master data only (patients,
// providers, insuranceContacts) — never inserts/modifies any of those.
// ===========================================================================
const CPT_POOL = ['99213', '99214', '99215', '99212', '90834', '93000', '80053', '85025', '36415', '71046'];
const DX_POOL = ['M54.5', 'I10', 'J06.9', 'E11.9', 'R51', 'K21.9', 'M79.1', 'F41.1', 'J45.909', 'N39.0'];
const REP_NAMES = ['Jennifer Adams', 'Carlos Mendez', 'Rita Thompson', 'Brian Cole', 'Diana Foster', 'Sam Okafor', 'Lena Rossi'];

export const seedClaims = internalMutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const count = args.count ?? 180;
    const patients = await ctx.db
      .query('patients').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const providers = await ctx.db
      .query('providers').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const medicalPayers = (await ctx.db
      .query('insuranceContacts').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect())
      .filter((c) => c.payerKind !== 'dental');
    const medicalProviders = providers.filter((p) => p.specialty !== 'General Dentistry');
    const provPool = medicalProviders.length > 0 ? medicalProviders : providers;

    if (patients.length === 0 || provPool.length === 0 || medicalPayers.length === 0) {
      return { created: 0, reason: 'missing master data (patients/providers/insuranceContacts)' };
    }

    let created = 0;
    for (let i = 0; i < count; i++) {
      const ageDays = randInt(1, 90);
      const dateOfService = dateOnly(isoDaysAgo(ageDays + randInt(1, 4)));
      const dateSubmitted = dateOnly(isoDaysAgo(ageDays + randInt(0, 2)));

      // Positive skew: mostly resolved-and-paid, small realistic minorities.
      const roll = Math.random() * 100;
      let status: string;
      if (roll < 88) status = 'paid';
      else if (roll < 91) status = 'appealing';
      else if (roll < 96) status = 'in_progress';
      else if (roll < 98) status = 'pending';
      else status = 'denied';

      const agingRoll = Math.random() * 100;
      const agingBucket =
        agingRoll < 55 ? '0-30' : agingRoll < 82 ? '31-60' : agingRoll < 95 ? '61-90' : '91-120';
      const priority = agingBucket === '91-120' || agingBucket === '120+'
        ? 'high'
        : agingBucket === '61-90' ? 'medium' : (chance(15) ? 'medium' : 'low');

      const amountCents = chance(70) ? randInt(8000, 90000) : randInt(90000, 450000);
      const claimNumber = `CX-${String(1000 + i).padStart(4, '0')}`;
      const referenceNumber = refNumber(dateSubmitted);

      const followUpAt = isoDaysAgo(Math.max(0, ageDays - randInt(1, 3)), randInt(9, 17), randInt(0, 59));
      const disposition = status === 'denied'
        ? (chance(60) ? 'complete' : 'reschedule')
        : status === 'in_progress' ? (chance(50) ? 'retry' : 'complete')
          : status === 'pending' ? undefined
            : 'complete';

      const commentByStatus: Record<string, string> = {
        paid: `Rep confirmed claim paid in full — $${(amountCents / 100).toFixed(2)}. EFT posted, no further action needed.`,
        appealing: 'Initial determination under review — appeal filed with supporting documentation, payer to respond within 30 days.',
        in_progress: 'Claim confirmed received and in adjudication — following up again in a few days.',
        denied: 'Payer confirmed denial — reviewing with provider for corrected resubmission.',
        pending: 'Just submitted — first follow-up call not yet placed.',
      };

      await ctx.db.insert('claims', {
        claimNumber,
        patientId: pick(patients)._id,
        insuranceContactId: pick(medicalPayers)._id,
        providerId: pick(provPool)._id,
        amount: amountCents,
        dateOfService,
        dateSubmitted,
        cptCodes: [pick(CPT_POOL)].concat(chance(30) ? [pick(CPT_POOL)] : []),
        diagnosisCodes: [pick(DX_POOL)],
        status,
        priority,
        agingBucket,
        denialCode: status === 'denied' ? pick(['CO-16', 'CO-97', 'CO-50']) : undefined,
        denialReason: status === 'denied' ? pick([
          'Prior authorization required for this service',
          'Duplicate claim submission',
          'Service not covered under current plan',
        ]) : undefined,
        referenceNumber,
        lastCalledAt: isoDaysAgo(Math.max(0, ageDays - randInt(0, 2))),
        nextFollowUpDate: disposition === 'retry' || disposition === 'reschedule'
          ? dateOnly(isoDaysAgo(-randInt(2, 10)))
          : undefined,
        followUpDisposition: disposition,
        followUpComment: disposition ? commentByStatus[status] : undefined,
        followUpBy: disposition ? pick(['Maria Gonzalez', 'Kevin Walsh', 'Rachel Kim']) : undefined,
        followUpAt: disposition ? followUpAt : undefined,
        userId: USER_ID,
        createdAt: isoDaysAgo(ageDays + randInt(1, 4)),
        updatedAt: followUpAt,
      });
      created++;
    }
    return { created };
  },
});

// ===========================================================================
// PHASE 4 — dental eligibility cases
// ===========================================================================
const CDT_POOL = ['D0150', 'D1110', 'D2740', 'D7240', 'D0274', 'D4341', 'D2750', 'D0220'];

export const seedDentalCases = internalMutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const count = args.count ?? 50;
    const patients = await ctx.db
      .query('patients').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const providers = await ctx.db
      .query('providers').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const dentalPayers = (await ctx.db
      .query('insuranceContacts').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect())
      .filter((c) => c.payerKind === 'dental');
    const dentalPlans = await ctx.db
      .query('dentalPlans').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const dentalProviders = providers.filter((p) => p.specialty === 'General Dentistry');
    const provPool = dentalProviders.length > 0 ? dentalProviders : providers;

    if (patients.length === 0 || provPool.length === 0 || dentalPayers.length === 0) {
      return { created: 0, reason: 'missing master data (patients/providers/dental insuranceContacts)' };
    }

    let created = 0;
    for (let i = 0; i < count; i++) {
      const ageDays = randInt(1, 90);
      const proposedDos = dateOnly(isoDaysAgo(ageDays - randInt(2, 10)));
      const roll = Math.random() * 100;
      const status = roll < 90 ? 'verified' : roll < 95 ? 'requires_human' : roll < 98 ? 'verifying' : 'awaiting_verification';
      const payer = pick(dentalPayers);
      const plan = dentalPlans.find((p) => p.insuranceContactId === payer._id) ?? undefined;

      await ctx.db.insert('dentalCases', {
        caseNumber: `EV-${String(2000 + i).padStart(4, '0')}`,
        patientId: pick(patients)._id,
        planId: plan?._id,
        insuranceContactId: payer._id,
        providerId: pick(provPool)._id,
        proposedDateOfService: proposedDos,
        cdtCodes: [pick(CDT_POOL)].concat(chance(25) ? [pick(CDT_POOL)] : []),
        status,
        priority: chance(20) ? 'medium' : 'low',
        lastCalledAt: isoDaysAgo(Math.max(0, ageDays - randInt(0, 2))),
        userId: USER_ID,
        createdAt: isoDaysAgo(ageDays),
        updatedAt: isoDaysAgo(Math.max(0, ageDays - randInt(0, 2))),
      });
      created++;
    }
    return { created };
  },
});

// ===========================================================================
// PHASE 5 — day-driven call volume: every day in the fabricated window gets
// its own batch of calls (default 30-50/day => thousands total over 90 days),
// each randomly attached to one of the existing claims/dentalCases (a claim
// can now get several follow-up calls over its lifetime, which is more
// realistic than a strict 1:1 mapping). All outcomes are 'successful' here —
// the small non-successful minority is layered on afterward in PHASE 7 by
// upgrading a handful of these into human-handoff scenarios — keeping the
// overall success rate comfortably ≥98% by construction regardless of volume.
//
// Chunked by day range (fromDaysAgo/toDaysAgo) so a single mutation call
// never has to insert the entire multi-thousand-row window in one
// transaction — invoke a few times covering the full 0-89 range.
// ===========================================================================
function medicalTranscript(payerName: string, claimNumber: string, amountCents: number, status: string): string {
  const paidLine = `our records show this claim was processed and paid in the amount of $${(amountCents / 100).toFixed(2)}. Payment was issued via electronic funds transfer`;
  const statusLine =
    status === 'paid' ? paidLine
      : status === 'denied' ? 'this claim was denied — a letter with the full explanation was mailed to the provider'
        : status === 'appealing' ? 'this claim is currently under appeal review, a decision is expected within thirty days'
          : 'this claim is currently in process, no final determination has been made yet';
  const variants = [
    `user: Thank you for calling ${payerName}, a preferred provider organization. Please listen carefully as our menu options have recently changed. For claims and billing, press one or say "Claims." For eligibility and benefits verification, press two or say "Eligibility."\nagent: [pressed 1] navigating to claims and billing\nagent: Claims.\nuser: You have reached the Claims Department. For claim status inquiry, press one or say "Claim status."\nagent: [pressed 1] navigating to claim status inquiry\nagent: Claim status.\nuser: Please enter the ten digit member ID followed by the pound sign.\nagent: [entered member ID]\nuser: Thank you. For claim number ${claimNumber}, ${statusLine}. Is there anything else I can help you with today?\nagent: No, that covers it. Thank you.\nuser: Thank you for calling ${payerName}. Goodbye.`,
    `user: You've reached ${payerName} provider services. Say "claims," "eligibility," or "member services."\nagent: Claims.\nuser: For an existing claim, say "check status." For a new claim, say "file a claim."\nagent: Check status.\nuser: Please say or enter the claim number now.\nagent: ${claimNumber}\nuser: One moment while I look that up... Thank you for waiting. For claim ${claimNumber}, ${statusLine}. Would you like this sent to you in writing as well?\nagent: No, verbal confirmation is sufficient.\nuser: Understood. Have a great day.`,
    `user: Welcome to the ${payerName} automated claims line. Para español, oprima el dos. For claims, press one.\nagent: [pressed 1]\nuser: Please enter the provider tax ID followed by the pound sign.\nagent: [entered tax ID]\nuser: Now enter the claim number.\nagent: ${claimNumber}\nuser: Retrieving claim details now... For claim ${claimNumber}, dated recently, ${statusLine}. Reference number has been generated for this call. Anything else today?\nagent: That's all, thank you.\nuser: Thank you for calling ${payerName}.`,
  ];
  return pick(variants);
}

function dentalTranscript(payerName: string, caseNumber: string): string {
  const variants = [
    `user: Thank you for calling ${payerName} dental provider services. For eligibility and benefits, press one.\nagent: [pressed 1]\nuser: Please enter the subscriber ID followed by the pound sign.\nagent: [entered subscriber ID]\nuser: Thank you. This member's plan is active and in good standing. Annual maximum and deductible details follow... Is there a specific procedure code you'd like coverage for?\nagent: Yes, checking coverage for case ${caseNumber}.\nuser: That procedure is a covered benefit under this plan, subject to standard coinsurance. Anything else today?\nagent: No, that's everything. Thank you.\nuser: Thank you for calling ${payerName}.`,
    `user: You've reached the ${payerName} eligibility line. Say "benefits" to continue.\nagent: Benefits.\nuser: Please provide the member ID.\nagent: [provided member ID]\nuser: This plan is currently active. Deductible has been met for this benefit period. Frequency limits for the requested procedure have not been exceeded. Would you like this confirmation faxed to the office?\nagent: No fax needed, verbal confirmation is fine.\nuser: Understood, have a great day.`,
  ];
  return pick(variants);
}

export const seedDailyCalls = internalMutation({
  args: {
    fromDaysAgo: v.number(), // inclusive, larger = further in the past
    toDaysAgo: v.number(), // inclusive, smaller = closer to today
    minPerDay: v.optional(v.number()),
    maxPerDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minPerDay = args.minPerDay ?? 30;
    const maxPerDay = args.maxPerDay ?? 50;
    const claims = await ctx.db
      .query('claims').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const cases = await ctx.db
      .query('dentalCases').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    if (claims.length === 0 && cases.length === 0) {
      return { callsCreated: 0, resultsCreated: 0, reason: 'no claims/dentalCases — run seedClaims/seedDentalCases first' };
    }

    // Cache payer names so we don't re-fetch per call.
    const payerNameCache = new Map<string, string>();
    async function payerName(id: any): Promise<string> {
      const key = String(id);
      if (payerNameCache.has(key)) return payerNameCache.get(key)!;
      const insurance = await ctx.db.get(id);
      const name = insurance?.name ?? 'the payer';
      payerNameCache.set(key, name);
      return name;
    }

    let callsCreated = 0;
    let resultsCreated = 0;

    for (let day = args.fromDaysAgo; day >= args.toDaysAgo; day--) {
      const numCalls = randInt(minPerDay, maxPerDay);
      for (let n = 0; n < numCalls; n++) {
        const useMedical = (chance(78) && claims.length > 0) || cases.length === 0;

        if (useMedical) {
          const claim = pick(claims);
          const name = await payerName(claim.insuranceContactId);
          const startedAt = isoDaysAgo(day, randInt(8, 18), randInt(0, 59));
          const duration = randInt(75, 260);
          const completedAt = addSeconds(startedAt, duration);

          const callId = await ctx.db.insert('calls', {
            claimId: claim._id,
            insuranceContactId: claim.insuranceContactId,
            useCase: 'medical_claim',
            status: 'completed',
            duration,
            transcript: medicalTranscript(name, claim.claimNumber, claim.amount, claim.status),
            callPhase: 'completed',
            holdStartedAt: addSeconds(startedAt, 8),
            holdDuration: randInt(20, 150),
            ivrSequenceUsed: '1,3',
            outcome: 'successful',
            outcomeReason: 'ivr_self_service_claim_status_retrieved',
            requiredFieldsRetrieved: ['claimStatus', 'paidAmount', 'referenceNumber'],
            userId: USER_ID,
            startedAt,
            completedAt,
          });
          callsCreated++;

          const confidence = randFloat(0.983, 0.997);
          const decisionDate = addDaysIso(completedAt, randInt(-10, 3));
          await ctx.db.insert('callResults', {
            callId,
            claimId: claim._id,
            claimStatus: claim.status === 'paid' ? 'Paid'
              : claim.status === 'denied' ? 'Denied'
                : claim.status === 'appealing' ? 'Under Appeal'
                  : 'Processing',
            paidAmount: claim.status === 'paid' ? claim.amount : 0,
            paidDate: claim.status === 'paid' ? dateOnly(decisionDate) : dateOnly(completedAt),
            checkOrEftNumber: claim.status === 'paid' ? `EFT-${randInt(1000000, 9999999)}` : 'N/A',
            denialCode: claim.denialCode,
            remarkCode: claim.status === 'denied' ? pick(['N130', 'N522', 'M76']) : undefined,
            denialReason: claim.denialReason ?? 'N/A — claim approved, no denial on file',
            appealDeadline: claim.status === 'denied' ? dateOnly(addDaysIso(completedAt, 60)) : undefined,
            expectedDecisionDate: dateOnly(decisionDate),
            referenceNumber: claim.referenceNumber ?? refNumber(completedAt),
            repName: pick(REP_NAMES),
            nextSteps: claim.status === 'paid'
              ? 'Claim paid in full — no further action needed.'
              : claim.status === 'denied'
                ? 'Claim denied — reviewing with provider for corrected resubmission.'
                : claim.status === 'appealing'
                  ? 'Appeal filed — awaiting payer decision.'
                  : 'Claim in process — follow up again in a few days.',
            rawExtraction: `Claim ${claim.claimNumber}: status=${claim.status}, amount=$${(claim.amount / 100).toFixed(2)}, rep=${pick(REP_NAMES)}.`,
            confidence,
            userId: USER_ID,
            createdAt: completedAt,
          });
          resultsCreated++;
        } else {
          const dCase = pick(cases);
          const name = await payerName(dCase.insuranceContactId);
          const startedAt = isoDaysAgo(day, randInt(8, 18), randInt(0, 59));
          const duration = randInt(70, 220);
          const completedAt = addSeconds(startedAt, duration);

          const callId = await ctx.db.insert('calls', {
            dentalCaseId: dCase._id,
            insuranceContactId: dCase.insuranceContactId,
            useCase: 'dental_ev',
            status: 'completed',
            duration,
            transcript: dentalTranscript(name, dCase.caseNumber),
            callPhase: 'completed',
            holdStartedAt: addSeconds(startedAt, 6),
            holdDuration: randInt(15, 100),
            ivrSequenceUsed: '1,3',
            outcome: 'successful',
            outcomeReason: 'ivr_self_service_eligibility_confirmed',
            requiredFieldsRetrieved: ['isActive', 'deductibleMetCents', 'networkStatus'],
            userId: USER_ID,
            startedAt,
            completedAt,
          });
          callsCreated++;

          const confidence = randFloat(0.983, 0.997);
          await ctx.db.insert('evResults', {
            callId,
            dentalCaseId: dCase._id,
            isActive: dCase.status !== 'requires_human',
            coverageEffectiveDate: dateOnly(addDaysIso(completedAt, -randInt(60, 400))),
            coverageTerminationDate: dateOnly(addDaysIso(completedAt, randInt(180, 400))),
            deductibleAnnualCents: pick([5000, 7500, 10000]),
            deductibleMetCents: pick([0, 2500, 5000]),
            coinsurancePct: pick([50, 80, 100]),
            copayCents: pick([0, 2000, 3000]),
            annualMaximumCents: pick([150000, 200000, 250000]),
            annualMaxRemainingCents: pick([50000, 90000, 120000, 180000]),
            networkStatus: chance(92) ? 'in_network' : 'out_of_network',
            repName: pick(REP_NAMES),
            referenceNumber: refNumber(completedAt),
            nextSteps: 'Eligibility confirmed — proceed with scheduling the proposed procedure.',
            rawExtraction: `Case ${dCase.caseNumber}: coverage active, coinsurance verified for ${dCase.cdtCodes.join(', ')}.`,
            confidence,
            userId: USER_ID,
            createdAt: completedAt,
          });
          resultsCreated++;
        }
      }
    }
    return { callsCreated, resultsCreated };
  },
});

// One-off targeted wipe for just calls/callResults/evResults — used when
// regenerating call volume without disturbing claims/dentalCases/users.
export const wipeCallsOnly = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = ['calls', 'callResults', 'evResults'] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      counts[t] = rows.length;
    }
    return counts;
  },
});

// ===========================================================================
// PHASE 7 — upgrade a small handful of already-created medical calls into
// human-handoff scenarios, so the operator queue / Call History "linked
// claims" features have real historical data too. Kept small (a few calls
// out of hundreds) so overall success/automation rates stay ≥98%.
// ===========================================================================
export const seedHandoffScenarios = internalMutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Kept small and safely under the 2% ceiling implied by the ≥98% success/
    // automation-rate requirement — see reports.successRate / operationalKpis.
    // Pass an explicit `count` sized to ~1-1.5% of total call volume.
    const count = args.count ?? 40;
    const operators = await ctx.db
      .query('users').withIndex('by_role', (q) => q.eq('role', 'operator')).collect();
    if (operators.length === 0) return { upgraded: 0, reason: 'no operator users found' };

    const claims = await ctx.db
      .query('claims').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const eligibleClaims = claims.filter((c) => c.status === 'paid' || c.status === 'in_progress');
    let upgraded = 0;

    for (let i = 0; i < count && i < eligibleClaims.length; i++) {
      const claim = eligibleClaims[randInt(0, eligibleClaims.length - 1)];
      const call = await ctx.db
        .query('calls').withIndex('by_claimId', (q) => q.eq('claimId', claim._id)).first();
      if (!call || call.handoffState) continue; // already upgraded or missing

      const operator = pick(operators);
      const requestedAt = addSeconds(call.startedAt, randInt(30, 90));
      const acceptedAt = addSeconds(requestedAt, randInt(5, 25));
      const humanDuration = randInt(90, 240);
      const endedAt = addSeconds(acceptedAt, humanDuration);
      const wrapUpAt = addSeconds(endedAt, randInt(60, 400));

      await ctx.db.patch(call._id, {
        outcome: 'transferred_to_human',
        outcomeReason: 'ivr_transfer_hold_detected',
        duration: Math.round((new Date(endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000),
        completedAt: endedAt,
        handoffState: 'handoff_ended',
        handoffRequestedAt: requestedAt,
        handoffReason: 'ivr_transfer_hold_detected',
        handoffAcceptedByUserId: operator._id,
        handoffAcceptedByEmail: operator.email,
        handoffAcceptedAt: acceptedAt,
        assignedAgentUserId: operator._id,
        assignedAgentEmail: operator.email,
        assignedAgentName: operator.name,
        conferenceName: `cadence-${call._id}`,
        humanTranscript: `Hi, thanks for holding — this is ${pick(REP_NAMES)} with the claims team, how can I help? / Calling about claim ${claim.claimNumber}, checking on status. / Let me pull that up... yes, I can confirm that claim is ${claim.status === 'paid' ? 'paid in full, payment issued via EFT' : 'currently in process and on track'}. / Great, thank you for confirming. / You're welcome, have a great day.`,
        wrapUpCompletedAt: wrapUpAt,
      });

      await ctx.db.patch(claim._id, {
        followUpDisposition: 'complete',
        followUpComment: `Spoke directly with payer rep ${pick(REP_NAMES)} — confirmed ${claim.status === 'paid' ? 'payment issued in full' : 'claim is progressing normally'}.`,
        followUpBy: operator.name,
        followUpAt: wrapUpAt,
        updatedAt: wrapUpAt,
      });
      upgraded++;
    }
    return { upgraded };
  },
});

// ===========================================================================
// PHASE 8 — a modest number of multi-item call sessions (RFP R-CONV-6),
// grouping a handful of the claims/dentalCases created above per payer.
// ===========================================================================
export const seedCallSessions = internalMutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const count = args.count ?? 18;
    const claims = await ctx.db
      .query('claims').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const cases = await ctx.db
      .query('dentalCases').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    if (claims.length === 0 && cases.length === 0) return { created: 0 };

    let created = 0;
    for (let i = 0; i < count; i++) {
      const useMedical = chance(70) && claims.length > 0;
      const pool = useMedical ? claims : cases;
      if (pool.length === 0) continue;
      const sampleSize = Math.min(pool.length, randInt(2, 5));
      const sample = [...pool].sort(() => Math.random() - 0.5).slice(0, sampleSize);
      const insuranceContactId = sample[0].insuranceContactId;
      const ageDays = randInt(1, 88);
      const createdAt = isoDaysAgo(ageDays, 9, 0);
      const startedAt = isoDaysAgo(ageDays, randInt(9, 16), randInt(0, 59));
      const completedAt = addSeconds(startedAt, randInt(300, 1800));

      await ctx.db.insert('callSessions', {
        insuranceContactId,
        useCase: useMedical ? 'medical_claim' : 'dental_ev',
        itemRefs: sample.map((s) => s._id),
        status: 'completed',
        aggregateOutcome: 'successful',
        notes: `Batch follow-up session — ${sample.length} items processed in one call.`,
        userId: USER_ID,
        createdAt,
        startedAt,
        completedAt,
      });
      created++;
    }
    return { created };
  },
});

// ===========================================================================
// PHASE 9 — audit trail (HIPAA-aligned) spread across the 90-day window.
// ===========================================================================
export const seedAuditEvents = internalMutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const count = args.count ?? 1200;
    const users = await ctx.db.query('users').collect();
    if (users.length === 0) return { created: 0, reason: 'no users found — run seedUsers first' };

    const claims = await ctx.db
      .query('claims').withIndex('by_userId', (q) => q.eq('userId', USER_ID)).collect();
    const actionPool: Array<{ action: string; resourceType: string }> = [
      { action: 'login', resourceType: 'session' },
      { action: 'read', resourceType: 'claim' },
      { action: 'update', resourceType: 'claim' },
      { action: 'create', resourceType: 'call' },
      { action: 'read', resourceType: 'report' },
    ];

    let created = 0;
    for (let i = 0; i < count; i++) {
      const user = pick(users);
      const entry = pick(actionPool);
      const ageDays = randInt(0, 89);
      const timestamp = isoDaysAgo(ageDays, randInt(8, 18), randInt(0, 59));
      const resourceId = entry.resourceType === 'claim' && claims.length > 0
        ? pick(claims)._id
        : undefined;

      await ctx.db.insert('auditEvents', {
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: resourceId as any,
        phiAccessed: entry.resourceType === 'claim',
        payloadSummary: entry.action === 'login'
          ? `${user.name} signed in`
          : `${entry.action} on ${entry.resourceType}${resourceId ? ` ${resourceId}` : ''}`,
        timestamp,
      });
      created++;
    }
    return { created };
  },
});

// One-off targeted wipe for callSessions + auditEvents — used to regenerate
// those after the date-fix without disturbing claims/dentalCases/calls.
export const wipeSessionsAndAudit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = ['callSessions', 'auditEvents'] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      counts[t] = rows.length;
    }
    return counts;
  },
});
