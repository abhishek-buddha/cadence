import { action, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { composePrompt, buildIvrContextSection } from './prompts/index';

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

export const remove = mutation({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');
    await ctx.db.delete(args.id);
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

    console.log(`[session:${args.sessionId}] items loaded: ${itemsData.length}`, itemsData.map((d, i) => `  [${i}] ${d.patientName} | memberId=${d.memberId} | ${d.isClaim ? `claim=${d.claimNumber}` : `cdtCodes=${d.cdtCodes}`}`).join('\n'));

    // Get provider for practice info via query
    const providers: any[] = await ctx.runQuery(api.providers.list);
    const provider: any = providers[0];
    if (!provider) throw new Error('No provider found');

    // Build full patient data block sent upfront — agent reads this to work all patients without mid-call tool fetches
    const allPatientsData = itemsData.map((d, i) => {
      const lines = [
        `PATIENT ${i + 1}:`,
        `  Name: ${d.patientName}`,
        `  DOB: ${d.patientDob}`,
        `  Member ID: ${d.memberId}`,
        `  Group #: ${d.groupNumber}`,
        `  DOS: ${d.dateOfService}`,
      ];
      if (d.isClaim) {
        lines.push(`  Claim #: ${d.claimNumber || 'N/A'}`);
        lines.push(`  Billed Amount: ${d.billedAmount ? '$' + d.billedAmount : 'N/A'}`);
        lines.push(`  CPT Codes: ${d.cptCodes || 'N/A'}`);
      } else {
        lines.push(`  CDT Codes: ${d.cdtCodes || 'N/A'}`);
      }
      return lines.join('\n');
    }).join('\n\n');

    const patientsSummary = itemsData.map((d, i) =>
      `${i + 1}. ${d.patientName} | DOB: ${d.patientDob} | Member ID: ${d.memberId}` +
      (d.claimNumber ? ` | Claim: ${d.claimNumber} | DOS: ${d.dateOfService}` : ` | CDT: ${d.cdtCodes} | DOS: ${d.dateOfService}`)
    ).join('\n');

    console.log(`[session:${args.sessionId}] all_patients_data (${allPatientsData.length} chars):\n${allPatientsData}`);

    // Use patient 1 as the initial dynamic variables
    const first = itemsData[0];
    const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || 'https://colorless-cardinal-959.convex.site';

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const AGENT_ID = session.useCase === 'dental_ev'
      ? (process.env.ELEVENLABS_DENTAL_AGENT_ID || process.env.ELEVENLABS_AGENT_ID)
      : process.env.ELEVENLABS_AGENT_ID;
    const AGENT_PHONE_NUMBER_ID = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
    const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';
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

    // Store forwarding number so the test IVR can route to the correct human agent line
    await ctx.runMutation(api.calls.setCallSetting, {
      key: 'forwardNumber',
      value: insurance.humanAgentNumber || '',
    });

    // Compose the full agent prompt with all patient data already substituted.
    // Sent as conversation_config_override so the session context block (patient
    // list + must-check-all constraint) is the very first thing the LLM reads,
    // overriding the base prompt's single-patient closing behavior.
    const voiceIvrPhrasesJson = JSON.stringify(insurance.voiceIvrPhrases || []);

    const promptVars: Record<string, string> = {
      practice_name: provider.practiceName,
      npi: provider.npi,
      tax_id: provider.taxId,
      callback_number: provider.phone,
      patient_name: first.patientName,
      patient_dob: first.patientDob,
      member_id: first.memberId,
      group_number: first.groupNumber,
      date_of_service: first.dateOfService,
      proposed_dos: first.dateOfService,
      insurance_name: insurance.name,
      insurance_phone: insurance.phone,
      human_agent_number: insurance.humanAgentNumber || '',
      ivr_instructions: insurance.ivrInstructions || 'Navigate IVR using voice responses.',
      voice_ivr_phrases: voiceIvrPhrasesJson,
      patient_count: String(itemsData.length),
      patients_summary: patientsSummary,
      all_patients_data: allPatientsData,
      // Medical claim specific
      claim_number: first.claimNumber || 'N/A',
      amount: first.billedAmount || 'N/A',
      cpt_codes: first.cptCodes || 'N/A',
      // Dental EV specific
      cdt_codes: first.cdtCodes || 'N/A',
      plan_name: 'N/A',
    };

    const composedPrompt = composePrompt({
      useCase: session.useCase as 'medical_claim' | 'dental_ev',
      isMultiPatient: itemsData.length > 1,
      hasVoiceIvr: !!insurance.voiceIvrEnabled,
      ivrContext: buildIvrContextSection(insurance.ivrInstructions, insurance.ivrSteps),
      vars: promptVars,
    });

    console.log(`[session:${args.sessionId}] launching ElevenLabs call — agentId=${AGENT_ID} to=${insurance.phone} patient_count=${itemsData.length} session_id=${args.sessionId}`);

    // Launch ElevenLabs call
    const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        agent_phone_number_id: AGENT_PHONE_NUMBER_ID,
        to_number: insurance.phone,
        conversation_initiation_client_data: {
          conversation_config_override: {
            agent: {
              prompt: { prompt: composedPrompt },
            },
          },
          dynamic_variables: {
            practice_name: provider.practiceName,
            npi: provider.npi,
            tax_id: provider.taxId,
            callback_number: provider.phone,
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
            human_agent_number: insurance.humanAgentNumber || '',
            ivr_instructions: insurance.ivrInstructions || 'Navigate IVR using voice responses.',
            voice_ivr_phrases: voiceIvrPhrasesJson,
            patient_count: String(itemsData.length),
            patients_summary: patientsSummary,
            all_patients_data: allPatientsData,
            session_id: args.sessionId,
            internal_call_id: callId,
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[session:${args.sessionId}] ElevenLabs call failed: ${response.status} ${err}`);
      await ctx.runMutation(api.calls.updateStatus, { id: callId, status: 'failed', errorMessage: err });
      throw new Error(`ElevenLabs error: ${err}`);
    }

    const result = await response.json();
    const callSid = result.call_sid || result.callSid;
    const conversationId = result.conversation_id || result.conversationId;

    console.log(`[session:${args.sessionId}] ElevenLabs raw response:`, JSON.stringify(result));

    if (!conversationId) {
      const errMsg = `ElevenLabs returned ${response.status} but no conversation_id. Body: ${JSON.stringify(result)}`;
      console.error(`[session:${args.sessionId}] ${errMsg}`);
      await ctx.runMutation(api.calls.updateStatus, { id: callId, status: 'failed', errorMessage: errMsg });
      throw new Error(errMsg);
    }

    console.log(`[session:${args.sessionId}] ElevenLabs call started — callSid=${callSid} conversationId=${conversationId} callId=${callId}`);

    await ctx.runMutation(api.calls.updateStatus, {
      id: callId,
      status: 'in_progress',
      twilioCallSid: callSid || undefined,
      elevenLabsConversationId: conversationId || undefined,
    });

    await ctx.runMutation(api.callSessions.updateStatus, { id: args.sessionId, status: 'in_progress' });

    // Start bridge monitor for real-time audio in browser
    if (conversationId) {
      try {
        const bridgeHttpUrl = BRIDGE_URL.replace('wss://', 'https://').replace('ws://', 'http://');
        await fetch(`${bridgeHttpUrl}/start-monitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, callId, convexSiteUrl: CONVEX_SITE_URL }),
        });
      } catch (e: any) {
        console.error('Failed to start bridge monitor (non-fatal):', e.message);
      }
    }

    // Attach Twilio stream for in-browser audio — first attempt at 1s
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    if (callSid && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const authHeader = 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 1000 : 5000));
        try {
          const callStatusRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
            { headers: { 'Authorization': authHeader } }
          );
          if (callStatusRes.ok) {
            const callData = await callStatusRes.json();
            if (['completed', 'failed', 'canceled'].includes(callData.status)) break;
            if (callData.status !== 'in-progress') continue;
          }
          const streamUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}/Streams.json`;
          const streamParams = new URLSearchParams();
          streamParams.append('Url', `${BRIDGE_URL}/monitor`);
          streamParams.append('Track', 'both_tracks');
          streamParams.append('Name', `session-monitor-${callId}`);
          streamParams.append('Parameter1.Name', 'callId');
          streamParams.append('Parameter1.Value', callId);
          const streamRes = await fetch(streamUrl, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: streamParams.toString(),
          });
          if (streamRes.ok) { console.log(`[session] Audio stream attached on attempt ${attempt + 1}`); break; }
        } catch (e: any) {
          console.error(`[session] Stream attempt ${attempt + 1} failed:`, e.message);
        }
      }
    }

    return { callId, conversationId, twilioCallSid: callSid };
  },
});

// ===========================================================================
// analyzeSessionTranscript — splits a multi-patient transcript by patient
// segment and runs separate claim/EV analysis for each item in the session.
// Also sets the session aggregate outcome when all items are processed.
// ===========================================================================
export const analyzeSessionTranscript = action({
  args: {
    sessionId: v.id('callSessions'),
    callId: v.id('calls'),
    transcript: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('Missing OpenAI API key');

    console.log(`[session-analysis:${args.sessionId}] transcript received — ${args.transcript.length} chars, callId=${args.callId}`);

    // Load session + patient list from callSettings
    const session: any = await ctx.runQuery(api.callSessions.getById, { id: args.sessionId });
    if (!session) throw new Error('Session not found');

    const itemsJson = await ctx.runQuery(api.calls.getCallSetting, {
      key: `session:${args.sessionId}:items`,
    });
    if (!itemsJson) {
      console.warn(`[session-analysis:${args.sessionId}] no items found in callSettings — falling back to single-patient analysis`);
      // Fallback: single-patient analysis on first item
      if (session.useCase === 'medical_claim' && session.itemRefs?.[0]) {
        await ctx.runAction(api.callActions.analyzeTranscript, {
          callId: args.callId,
          claimId: session.itemRefs[0] as any,
          transcript: args.transcript,
          userId: args.userId,
        });
      }
      return;
    }

    const items: any[] = JSON.parse(itemsJson);
    console.log(`[session-analysis:${args.sessionId}] items from callSettings: ${items.length}`, items.map((it, i) => `[${i}] ${it.patientName}`).join(', '));
    const today = new Date().toISOString().split('T')[0];

    // Ask GPT to split the transcript into per-patient segments
    const splitResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-5.2',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a medical billing transcript analyst. A single phone call covered multiple patients sequentially.
Split this transcript into per-patient segments.

Patients covered in this call (in order):
${items.map((it, i) => `${i + 1}. ${it.patientName} | Member: ${it.memberId} | ${it.isClaim ? `Claim: ${it.claimNumber}` : `CDT: ${it.cdtCodes}`} | DOS: ${it.dateOfService}`).join('\n')}

Return JSON:
{
  "segments": [
    { "patientIndex": 0, "patientName": "...", "transcript": "the relevant portion of the transcript for this patient" },
    { "patientIndex": 1, "patientName": "...", "transcript": "..." }
  ]
}

Rules:
- patientIndex is 0-based (0 = first patient)
- Each segment should include the full conversation about that patient
- Include the IVR navigation in segment 0 only
- If a patient was not discussed (rep refused), return an empty transcript for them`,
          },
          { role: 'user', content: args.transcript },
        ],
      }),
    });

    let segments: any[] = [];
    if (splitResponse.ok) {
      try {
        const splitResult = await splitResponse.json();
        const parsed = JSON.parse(splitResult.choices[0].message.content);
        segments = parsed.segments || [];
      } catch { segments = []; }
    }

    console.log(`[session-analysis:${args.sessionId}] GPT split result: ${segments.length} segment(s)`, segments.map((s: any) => `[${s.patientIndex}] ${s.patientName} (${s.transcript?.length ?? 0} chars)`).join(', '));

    // If splitting failed, use full transcript for first item only
    if (segments.length === 0 && items.length > 0) {
      console.warn(`[session-analysis:${args.sessionId}] GPT split returned 0 segments — falling back to full transcript for item 0`);
      segments = [{ patientIndex: 0, patientName: items[0].patientName, transcript: args.transcript }];
    }

    const outcomes: string[] = [];

    // Run analysis for each segment
    for (const seg of segments) {
      const item = items[seg.patientIndex];
      if (!item || !seg.transcript) {
        console.warn(`[session-analysis:${args.sessionId}] skipping segment patientIndex=${seg.patientIndex} — item=${!!item} transcriptLen=${seg.transcript?.length ?? 0}`);
        continue;
      }

      console.log(`[session-analysis:${args.sessionId}] analyzing segment [${seg.patientIndex}] ${seg.patientName} — ${seg.transcript.length} chars, isClaim=${item.isClaim}`);
      try {
        if (item.isClaim && item.ref) {
          await ctx.runAction(api.callActions.analyzeTranscript, {
            callId: args.callId,
            claimId: item.ref as any,
            transcript: seg.transcript,
            userId: args.userId,
          });
        } else if (!item.isClaim && item.ref) {
          await ctx.runAction(api.dentalCallActions.analyzeEvTranscript, {
            callId: args.callId,
          });
        }
        console.log(`[session-analysis:${args.sessionId}] segment [${seg.patientIndex}] analysis complete`);
        outcomes.push('successful');
      } catch (e: any) {
        console.error(`[session-analysis:${args.sessionId}] segment [${seg.patientIndex}] analysis failed:`, e.message);
        outcomes.push('failed');
      }
    }

    // Set session aggregate outcome
    const hasSuccessful = outcomes.includes('successful');
    const allSuccessful = outcomes.length > 0 && outcomes.every((o) => o === 'successful');
    const aggregateOutcome = allSuccessful ? 'successful' : hasSuccessful ? 'partial' : 'failed';
    console.log(`[session-analysis:${args.sessionId}] outcomes: [${outcomes.join(', ')}] → aggregateOutcome=${aggregateOutcome}`);

    try {
      await ctx.runMutation(api.callSessions.setAggregateOutcome, {
        id: args.sessionId,
        aggregateOutcome,
      });
      await ctx.runMutation(api.callSessions.updateStatus, {
        id: args.sessionId,
        status: 'completed',
      });
    } catch (e: any) {
      console.error('Failed to set session aggregate outcome:', e.message);
    }

    return { segmentsAnalyzed: segments.length, aggregateOutcome };
  },
});
