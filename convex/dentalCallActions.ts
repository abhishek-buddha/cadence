import { action } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { classifyDentalCallOutcome } from './outcomeClassifier';
import { composePrompt, buildIvrContextSection } from './prompts/index';

export const initiateEvCall = action({
  args: {
    dentalCaseId: v.id('dentalCases'),
  },
  handler: async (ctx, args) => {
    // 1. Fetch dental case + related entities
    const data: any = await ctx.runQuery(api.dentalCases.getWithDetails, { id: args.dentalCaseId });
    if (!data || !data.case) throw new Error('Dental case not found');

    const { case: dentalCase, patient, plan, insurance, provider } = data;
    if (!patient || !insurance || !provider) {
      throw new Error('Missing patient, insurance, or provider data for this case');
    }

    // 2. Create call record
    const callId: any = await ctx.runMutation(api.calls.create, {
      dentalCaseId: args.dentalCaseId,
      useCase: 'dental_ev',
      insuranceContactId: dentalCase.insuranceContactId,
      status: 'initiating',
      startedAt: new Date().toISOString(),
    });

    // ElevenLabs config — dental agent ID with fallback to general agent
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const AGENT_ID = process.env.ELEVENLABS_DENTAL_AGENT_ID || process.env.ELEVENLABS_AGENT_ID;
    const AGENT_PHONE_NUMBER_ID = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

    if (!ELEVENLABS_API_KEY || !AGENT_ID || !AGENT_PHONE_NUMBER_ID) {
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'failed',
        errorMessage: 'Missing ElevenLabs credentials in environment variables',
      });
      throw new Error('ElevenLabs not configured');
    }

    // Store forwarding number so the test IVR can route to the correct human agent line
    await ctx.runMutation(api.calls.setCallSetting, {
      key: 'forwardNumber',
      value: insurance.humanAgentNumber || '',
    });

    try {
      const voiceIvrPhrasesJson = JSON.stringify(insurance.voiceIvrPhrases || []);

      const dynamicVars: Record<string, string> = {
        practice_name: provider.practiceName,
        npi: provider.npi,
        tax_id: provider.taxId,
        callback_number: provider.phone,
        patient_name: `${patient.firstName} ${patient.lastName}`,
        patient_dob: patient.dateOfBirth,
        member_id: patient.memberId,
        plan_name: plan?.planName ?? 'N/A',
        group_number: patient.groupNumber || plan?.groupNumber || 'N/A',
        cdt_codes: (dentalCase.cdtCodes || []).join(', ') || 'N/A',
        proposed_dos: dentalCase.proposedDateOfService,
        internal_call_id: callId,
        internal_case_id: args.dentalCaseId,
        insurance_name: insurance.name,
        insurance_phone: insurance.phone,
        human_agent_number: insurance.humanAgentNumber || '',
        ivr_instructions: insurance.ivrInstructions || 'Navigate IVR using voice responses. Speak your selections clearly instead of pressing keys.',
        voice_ivr_phrases: voiceIvrPhrasesJson,
      };

      const composedPrompt = composePrompt({
        useCase: 'dental_ev',
        hasVoiceIvr: !!insurance.voiceIvrEnabled,
        ivrContext: buildIvrContextSection(insurance.ivrInstructions, insurance.ivrSteps),
        vars: {
          practice_name: provider.practiceName,
          patient_name: `${patient.firstName} ${patient.lastName}`,
          patient_dob: patient.dateOfBirth,
          member_id: patient.memberId,
          plan_name: plan?.planName ?? 'N/A',
          group_number: patient.groupNumber || plan?.groupNumber || 'N/A',
          proposed_dos: dentalCase.proposedDateOfService,
          cdt_codes: (dentalCase.cdtCodes || []).join(', ') || 'N/A',
          insurance_name: insurance.name,
          voice_ivr_phrases: voiceIvrPhrasesJson,
        },
      });

      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
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
            dynamic_variables: dynamicVars,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const callSid = result.call_sid || result.callSid;
      const conversationId = result.conversation_id || result.conversationId;

      // Update call: status, conversation id, twilio sid
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'in_progress',
        twilioCallSid: callSid || undefined,
        elevenLabsConversationId: conversationId || undefined,
      });

      // Mark case as verifying
      await ctx.runMutation(api.dentalCases.updateStatus, {
        id: args.dentalCaseId,
        status: 'verifying',
      });

      await ctx.runMutation(api.dentalCases.update, {
        id: args.dentalCaseId,
        lastCalledAt: new Date().toISOString(),
      });

      // Tell bridge server to monitor this conversation for real-time audio/events
      const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';
      const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || 'https://colorless-cardinal-959.convex.site';
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

      // Attach passive Twilio stream for browser audio — first attempt at 1s, then every 5s
      const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
      const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
      if (callSid && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        const authHeader = 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1000 : 5000));
          try {
            const callStatusRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
              { headers: { 'Authorization': authHeader } }
            );
            if (callStatusRes.ok) {
              const callData = await callStatusRes.json();
              const status = callData.status;
              if (status === 'completed' || status === 'failed' || status === 'canceled') {
                console.log(`[dental-stream] Call already ended (${status}), skipping stream`);
                break;
              }
              if (status !== 'in-progress') {
                console.log(`[dental-stream] Not in-progress yet (${status}), retrying...`);
                continue;
              }
            }
            const streamUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}/Streams.json`;
            const streamParams = new URLSearchParams();
            streamParams.append('Url', `${BRIDGE_URL}/monitor`);
            streamParams.append('Track', 'both_tracks');
            streamParams.append('Name', `dental-monitor-${callId}`);
            streamParams.append('Parameter1.Name', 'callId');
            streamParams.append('Parameter1.Value', callId);
            const streamRes = await fetch(streamUrl, {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: streamParams.toString(),
            });
            console.log(`[dental-stream] Attempt ${attempt + 1}: ${streamRes.status} for callSid=${callSid}`);
            if (streamRes.ok) break;
          } catch (streamErr: any) {
            console.error(`[dental-stream] Attempt ${attempt + 1} failed:`, streamErr.message);
          }
        }
      }

      return { callId, conversationId, twilioCallSid: callSid };
    } catch (error: any) {
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'failed',
        errorMessage: error.message,
      });
      throw error;
    }
  },
});

export const analyzeEvTranscript = action({
  args: {
    callId: v.id('calls'),
  },
  handler: async (ctx, args) => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('Missing OpenAI API key');

    const call: any = await ctx.runQuery(api.calls.getById, { id: args.callId });
    if (!call) throw new Error('Call not found');
    if (!call.dentalCaseId) throw new Error('Call is not linked to a dental case');
    if (!call.transcript) throw new Error('Call has no transcript to analyze');

    const caseData: any = await ctx.runQuery(api.dentalCases.getWithDetails, { id: call.dentalCaseId });
    const dc = caseData?.case;
    const patient = caseData?.patient;
    const insurance = caseData?.insurance;
    const plan = caseData?.plan;

    const today = new Date().toISOString().split('T')[0];
    const ctxStr = dc
      ? `Case: ${dc.caseNumber}, Patient: ${patient?.firstName} ${patient?.lastName}, DOB: ${patient?.dateOfBirth}, Member ID: ${patient?.memberId}, Insurance: ${insurance?.name}, Plan: ${plan?.planName ?? 'N/A'}, CDT Codes: ${(dc.cdtCodes || []).join(', ')}, Proposed DOS: ${dc.proposedDateOfService}`
      : '';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a dental eligibility extraction specialist. Analyze phone call transcripts between dental billing agents and insurance representatives to extract structured eligibility verification (EV) data.

Today's date is ${today}.
${ctxStr}

EXTRACTION RULES:
- Only extract information EXPLICITLY stated. Never guess or infer.
- For dollar amounts, convert to CENTS (e.g., $1,500.00 = 150000).
- For percentages, return whole numbers (e.g., 80% = 80).
- networkStatus must be one of: "in_network", "out_of_network", "unknown".
- isActive: true if coverage is currently active, false if terminated/inactive, null if not stated.
- referenceNumber should be the call reference/confirmation number provided by the rep.
- repName: name or ID of the insurance representative who answered.
- frequencyLimits: array of { cdtCode, limitDescription, remainingThisYear }.
- waitingPeriods: array of { cdtCode, endsOn, satisfied }.
- nextSteps: a concise actionable recommendation.

Return a JSON object with ONLY these fields:
{
  "isActive": null,
  "coverageEffectiveDate": null,
  "coverageTerminationDate": null,
  "deductibleAnnualCents": null,
  "deductibleMetCents": null,
  "coinsurancePct": null,
  "copayCents": null,
  "annualMaximumCents": null,
  "annualMaxRemainingCents": null,
  "networkStatus": null,
  "frequencyLimits": null,
  "waitingPeriods": null,
  "repName": null,
  "referenceNumber": null,
  "nextSteps": "string",
  "confidence": 0.0
}

Use null for any field where information was NOT explicitly provided.`,
          },
          {
            role: 'user',
            content: `Transcript:\n${call.transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('OpenAI error:', response.status, errBody);
      throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    let extraction: any;
    try {
      extraction = JSON.parse(result.choices[0].message.content);
    } catch {
      extraction = { isActive: null, nextSteps: 'Manual review required - parse failed', confidence: 0 };
    }

    // Auto-generate reference number if missing
    const now = new Date();
    const autoRef = `EV-REF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const referenceNumber = extraction.referenceNumber || autoRef;

    await ctx.runMutation(internal.evResults.create, {
      callId: args.callId,
      dentalCaseId: call.dentalCaseId,
      isActive: extraction.isActive ?? undefined,
      coverageEffectiveDate: extraction.coverageEffectiveDate ?? undefined,
      coverageTerminationDate: extraction.coverageTerminationDate ?? undefined,
      deductibleAnnualCents: extraction.deductibleAnnualCents ?? undefined,
      deductibleMetCents: extraction.deductibleMetCents ?? undefined,
      coinsurancePct: extraction.coinsurancePct ?? undefined,
      copayCents: extraction.copayCents ?? undefined,
      annualMaximumCents: extraction.annualMaximumCents ?? undefined,
      annualMaxRemainingCents: extraction.annualMaxRemainingCents ?? undefined,
      networkStatus: extraction.networkStatus ?? undefined,
      frequencyLimits: extraction.frequencyLimits ?? undefined,
      waitingPeriods: extraction.waitingPeriods ?? undefined,
      repName: extraction.repName ?? undefined,
      referenceNumber,
      nextSteps: extraction.nextSteps ?? undefined,
      rawExtraction: JSON.stringify(extraction),
      confidence: extraction.confidence ?? undefined,
    });

    // Classify outcome and patch call + case
    const evForClass = { ...extraction, referenceNumber };
    const classification = classifyDentalCallOutcome(evForClass, call.status);

    await ctx.runMutation(api.calls.updateStatus, {
      id: args.callId,
      status: call.status,
    });

    // calls.updateStatus doesn't expose outcome fields — use a generic patch via dentalCases pattern
    // We'll rely on a separate patch through the dental cases bridge: write outcome directly
    await ctx.runMutation(internal.evResults.patchCallOutcome, {
      callId: args.callId,
      outcome: classification.outcome === 'successful' ? 'successful' : classification.outcome === 'partial' ? 'partial' : 'failed',
      outcomeReason: classification.reason,
      requiredFieldsRetrieved: classification.requiredFieldsRetrieved,
      missingFields: classification.missingFields,
    });

    // Update case status
    const newCaseStatus = classification.outcome === 'successful' ? 'verified' : 'failed';
    try {
      await ctx.runMutation(api.dentalCases.updateStatus, {
        id: call.dentalCaseId,
        status: newCaseStatus,
      });
    } catch (e) {
      // Transition may be invalid — fall back to direct update
      await ctx.runMutation(api.dentalCases.update, {
        id: call.dentalCaseId,
        status: newCaseStatus,
      });
    }

    return classification;
  },
});
