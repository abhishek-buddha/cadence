import { action, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

const MAX_ITEMS_PER_SESSION = 5;
const VALID_STATUSES = ['queued', 'in_progress', 'completed', 'paused', 'failed'];

export const create = mutation({
  args: {
    insuranceContactId: v.id('insuranceContacts'),
    useCase: v.string(),
    itemRefs: v.array(v.union(v.id('claims'), v.id('dentalCases'))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';

    if (args.itemRefs.length === 0) throw new Error('Session must have at least 1 item');
    if (args.itemRefs.length > MAX_ITEMS_PER_SESSION) {
      throw new Error(`Max ${MAX_ITEMS_PER_SESSION} items per session`);
    }
    if (!['medical_claim', 'dental_ev'].includes(args.useCase)) {
      throw new Error(`Invalid useCase: ${args.useCase}`);
    }

    // Validate every item belongs to same payer + matches useCase
    for (const ref of args.itemRefs) {
      const item: any = await ctx.db.get(ref);
      if (!item) throw new Error(`Item not found: ${ref}`);
      if (item.insuranceContactId !== args.insuranceContactId) {
        throw new Error('All items must share the same insuranceContactId');
      }
      const isClaim = 'claimNumber' in item;
      const isCase = 'caseNumber' in item;
      if (args.useCase === 'medical_claim' && !isClaim) throw new Error('Item is not a medical claim');
      if (args.useCase === 'dental_ev' && !isCase) throw new Error('Item is not a dental case');
    }

    return await ctx.db.insert('callSessions', {
      insuranceContactId: args.insuranceContactId,
      useCase: args.useCase,
      itemRefs: args.itemRefs,
      status: 'queued',
      notes: args.notes,
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
      .query('callSessions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getWithItems = query({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;

    const insurance = await ctx.db.get(session.insuranceContactId);

    // Per-item: fetch the claim/case + latest result + last call (for inline status display)
    const items = await Promise.all(
      session.itemRefs.map(async (ref) => {
        const entity: any = await ctx.db.get(ref);
        if (!entity) return { ref, entity: null, result: null, lastCall: null };

        let result: any = null;
        let lastCall: any = null;

        if (session.useCase === 'medical_claim') {
          result = await ctx.db
            .query('callResults')
            .withIndex('by_claimId', (q) => q.eq('claimId', ref as any))
            .order('desc')
            .first();
          lastCall = await ctx.db
            .query('calls')
            .withIndex('by_claimId', (q) => q.eq('claimId', ref as any))
            .order('desc')
            .first();
        } else {
          result = await ctx.db
            .query('evResults')
            .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', ref as any))
            .order('desc')
            .first();
          lastCall = await ctx.db
            .query('calls')
            .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', ref as any))
            .order('desc')
            .first();
        }

        return { ref, entity, result, lastCall };
      })
    );

    return { session, insurance, items };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id('callSessions'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    if (!VALID_STATUSES.includes(args.status)) {
      throw new Error(`Invalid status: ${args.status}`);
    }
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');

    const patch: Record<string, unknown> = { status: args.status };
    // Auto-stamp lifecycle timestamps based on status transitions
    if (args.status === 'in_progress' && !session.startedAt) {
      patch.startedAt = new Date().toISOString();
    }
    if ((args.status === 'completed' || args.status === 'failed') && !session.completedAt) {
      patch.completedAt = new Date().toISOString();
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const setAggregateOutcome = mutation({
  args: {
    id: v.id('callSessions'),
    aggregateOutcome: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { aggregateOutcome: args.aggregateOutcome });
  },
});

export const pause = mutation({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'in_progress' && session.status !== 'queued') {
      throw new Error(`Cannot pause session in status "${session.status}"`);
    }
    await ctx.db.patch(args.id, { status: 'paused' });
  },
});

export const resume = mutation({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'paused') {
      throw new Error(`Cannot resume session in status "${session.status}"`);
    }
    const patch: Record<string, unknown> = { status: 'in_progress' };
    if (!session.startedAt) patch.startedAt = new Date().toISOString();
    await ctx.db.patch(args.id, patch);
  },
});

// Returns items for a session with display labels and per-item outcome state.
// Used by SessionDetailPanel to render the items list.
export const listItems = query({
  args: { sessionId: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];

    const items = await Promise.all(
      (session.itemRefs ?? []).map(async (ref) => {
        const entity: any = await ctx.db.get(ref);
        if (!entity) {
          return { _id: ref, label: 'Unknown', detail: '', outcome: null, missingFields: [] };
        }

        const isClaim = 'claimNumber' in entity;
        const label = isClaim ? entity.claimNumber : entity.caseNumber;
        const amountStr = entity.amount != null
          ? `$${Number(entity.amount).toFixed(2)}`
          : '$0.00';
        const detail = isClaim
          ? `${amountStr} · DOS ${entity.dateOfService ?? '--'}`
          : `CDT: ${(entity.cdtCodes ?? []).join(', ') || '--'} · DOS ${entity.proposedDateOfService ?? '--'}`;

        const lastCall: any = isClaim
          ? await ctx.db
              .query('calls')
              .withIndex('by_claimId', (q) => q.eq('claimId', ref as any))
              .order('desc')
              .first()
          : await ctx.db
              .query('calls')
              .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', ref as any))
              .order('desc')
              .first();

        return {
          _id: ref,
          label,
          detail,
          outcome: lastCall?.outcome ?? null,
          missingFields: lastCall?.missingFields ?? [],
        };
      })
    );

    return items;
  },
});

// Returns the currently active call for a session (initiating / ringing / in_progress).
// Used by SessionDetailPanel to show the live call monitor.
export const getActiveCall = query({
  args: { sessionId: v.id('callSessions') },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .collect();

    return (
      calls.find((c) =>
        ['initiating', 'ringing', 'in_progress'].includes(c.status)
      ) ?? null
    );
  },
});

// ===========================================================================
// executeSession — starts a multi-patient call for the session.
// Makes ONE outbound call that covers all patients sequentially.
// ===========================================================================
export const executeSession = action({
  args: { sessionId: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.callSessions.getById, { id: args.sessionId });
    if (!session) throw new Error('Session not found');
    if (session.status !== 'queued' && session.status !== 'paused') {
      throw new Error(`Cannot start session in status "${session.status}"`);
    }

    const insurance: any = await ctx.runQuery(api.insuranceContacts.getById, { id: session.insuranceContactId });
    if (!insurance) throw new Error('Insurance contact not found');

    // Fetch all items with their patient + claim/case data via getWithItems query
    const withItems: any = await ctx.runQuery(api.callSessions.getWithItems, { id: args.sessionId });
    if (!withItems) throw new Error('Could not load session items');

    const allPatients: any[] = await ctx.runQuery(api.patients.list);
    const patientMap = new Map((allPatients || []).map((p: any) => [p._id, p]));

    const itemsData: any[] = [];
    for (const rawItem of (withItems.items ?? [])) {
      const item = rawItem.entity;
      if (!item) continue;
      const patient: any = item.patientId ? patientMap.get(item.patientId) : null;
      const isClaim = 'claimNumber' in item;
      const ref = rawItem.ref;
      itemsData.push({
        ref,
        isClaim,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
        patientDob: patient?.dateOfBirth || 'Unknown',
        memberId: patient?.memberId || 'Unknown',
        groupNumber: patient?.groupNumber || 'N/A',
        claimNumber: isClaim ? item.claimNumber : null,
        dateOfService: isClaim ? item.dateOfService : item.proposedDateOfService,
        billedAmount: isClaim && item.amount != null ? Number(item.amount).toFixed(2) : null,
        cptCodes: isClaim ? (item.cptCodes || []).join(', ') || 'N/A' : null,
        cdtCodes: !isClaim ? (item.cdtCodes || []).join(', ') || 'N/A' : null,
        caseId: !isClaim ? ref : null,
      });
    }

    if (itemsData.length === 0) throw new Error('Session has no valid items');

    // Get provider for practice info via query
    const providers: any[] = await ctx.runQuery(api.providers.list);
    const provider: any = providers[0];
    if (!provider) throw new Error('No provider found');

    // Build patients summary for multi-patient prompt
    const patientsSummary = itemsData.map((d, i) =>
      `${i + 1}. ${d.patientName} | DOB: ${d.patientDob} | Member ID: ${d.memberId}` +
      (d.claimNumber ? ` | Claim: ${d.claimNumber} | DOS: ${d.dateOfService}` : ` | CDT: ${d.cdtCodes} | DOS: ${d.dateOfService}`)
    ).join('\n');

    // Use patient 1 as the initial dynamic variables
    const first = itemsData[0];
    const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || 'https://colorless-cardinal-959.convex.site';

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
    const AGENT_PHONE_NUMBER_ID = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
    if (!ELEVENLABS_API_KEY || !AGENT_ID || !AGENT_PHONE_NUMBER_ID) {
      throw new Error('ElevenLabs not configured');
    }

    // Create call record for the session
    const callId: any = await ctx.runMutation(api.calls.create, {
      claimId: first.isClaim ? (first.ref as any) : undefined,
      dentalCaseId: !first.isClaim ? (first.ref as any) : undefined,
      sessionId: args.sessionId,
      useCase: session.useCase,
      insuranceContactId: session.insuranceContactId,
      status: 'initiating',
      startedAt: new Date().toISOString(),
    });

    // Store full session item list in callSettings so next_patient tool can read it
    await ctx.runMutation(api.calls.setCallSetting, {
      key: `session:${args.sessionId}:items`,
      value: JSON.stringify(itemsData.map((d) => ({
        patientName: d.patientName,
        patientDob: d.patientDob,
        memberId: d.memberId,
        groupNumber: d.groupNumber,
        claimNumber: d.claimNumber,
        caseId: d.caseId,
        dateOfService: d.dateOfService,
        billedAmount: d.billedAmount,
        cptCodes: d.cptCodes,
        cdtCodes: d.cdtCodes,
        isClaim: d.isClaim,
        ref: d.ref,
      }))),
    });

    await ctx.runMutation(api.calls.setCallSetting, {
      key: `session:${args.sessionId}:currentIndex`,
      value: '0',
    });

    await ctx.runMutation(api.calls.setCallSetting, {
      key: `session:${args.sessionId}:callId`,
      value: callId,
    });

    // Launch ElevenLabs call
    const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        agent_phone_number_id: AGENT_PHONE_NUMBER_ID,
        to_number: insurance.phone,
        conversation_initiation_client_data: {
          dynamic_variables: {
            practice_name: provider.practiceName,
            npi: provider.npi,
            tax_id: provider.taxId,
            callback_number: provider.phone,
            // Patient 1 starts as the active patient
            patient_name: first.patientName,
            patient_dob: first.patientDob,
            member_id: first.memberId,
            group_number: first.groupNumber,
            claim_number: first.claimNumber || 'N/A',
            date_of_service: first.dateOfService,
            billed_amount: first.billedAmount || 'N/A',
            cpt_codes: first.cptCodes || 'N/A',
            cdt_codes: first.cdtCodes || 'N/A',
            insurance_name: insurance.name,
            insurance_phone: insurance.phone,
            ivr_instructions: insurance.ivrInstructions || 'Navigate IVR using voice responses.',
            // Multi-patient session context
            patient_count: String(itemsData.length),
            patients_summary: patientsSummary,
            session_id: args.sessionId,
            internal_call_id: callId,
            next_patient_url: `${CONVEX_SITE_URL}/session-tool/next-patient`,
            refuse_patient_url: `${CONVEX_SITE_URL}/session-tool/refuse-patient`,
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      await ctx.runMutation(api.calls.updateStatus, { id: callId, status: 'failed', errorMessage: err });
      throw new Error(`ElevenLabs error: ${err}`);
    }

    const result = await response.json();
    const callSid = result.call_sid || result.callSid;
    const conversationId = result.conversation_id || result.conversationId;

    await ctx.runMutation(api.calls.updateStatus, {
      id: callId,
      status: 'in_progress',
      twilioCallSid: callSid || undefined,
      elevenLabsConversationId: conversationId || undefined,
    });

    await ctx.runMutation(api.callSessions.updateStatus, { id: args.sessionId, status: 'in_progress' });

    return { callId, conversationId, twilioCallSid: callSid };
  },
});
