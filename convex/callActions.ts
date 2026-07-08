import { action, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { classifyMedicalCallOutcome } from './outcomeClassifier';
import { composePrompt, buildIvrContextSection } from './prompts/index';

export const initiateCall = action({
  args: {
    claimId: v.id('claims'),
  },
  handler: async (ctx, args): Promise<{ success: boolean; callId: string; twilioCallSid?: string; conversationId?: string }> => {
    const identity = await ctx.auth.getUserIdentity();

    // 1. Fetch claim with all related data
    const data: any = await ctx.runQuery(api.claims.getWithDetails, { id: args.claimId });
    if (!data || !data.claim) throw new Error('Claim not found');

    const { claim, patient, insurance, provider } = data;
    if (!patient || !insurance || !provider) {
      throw new Error('Missing patient, insurance, or provider data for this claim');
    }

    // 2. Create call record
    const callId: any = await ctx.runMutation(api.calls.create, {
      claimId: args.claimId,
      insuranceContactId: claim.insuranceContactId,
      status: 'initiating',
      startedAt: new Date().toISOString(),
    });

    // Stamp useCase on the call (calls.create has narrow args)
    await ctx.runMutation(internal.callActions.patchCallUseCase, {
      callId,
      useCase: 'medical_claim',
    });

    // Store forwarding number for the test IVR to read
    await ctx.runMutation(api.calls.setCallSetting, {
      key: 'forwardNumber',
      value: insurance.humanAgentNumber || '',
    });

    // 3. Use ElevenLabs native outbound call API (proven to work with IVR)
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
    const AGENT_PHONE_NUMBER_ID = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

    if (!ELEVENLABS_API_KEY || !AGENT_ID || !AGENT_PHONE_NUMBER_ID) {
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'failed',
        errorMessage: 'Missing ElevenLabs credentials in environment variables',
      });
      throw new Error('ElevenLabs not configured');
    }

    try {
      // Compose the per-call system prompt with this payer's IVR context
      // (free-text instructions + configured DTMF steps) and voice-phrase
      // table baked in as literal text — not left as unresolved {{}} tokens,
      // since the base prompt templates don't declare those placeholders.
      const ivrContext = buildIvrContextSection(insurance.ivrInstructions, insurance.ivrSteps);
      const voiceIvrPhrasesJson = JSON.stringify(insurance.voiceIvrPhrases || []);

      const promptVars: Record<string, string> = {
        practice_name: provider.practiceName,
        npi: provider.npi,
        tax_id: provider.taxId,
        callback_number: provider.phone,
        patient_name: `${patient.firstName} ${patient.lastName}`,
        patient_dob: patient.dateOfBirth,
        member_id: patient.memberId,
        group_number: patient.groupNumber || 'N/A',
        claim_number: claim.claimNumber,
        date_of_service: claim.dateOfService,
        amount: (claim.amount / 100).toFixed(2),
        cpt_codes: (claim.cptCodes || []).join(', ') || 'N/A',
        insurance_name: insurance.name,
        insurance_phone: insurance.phone,
        voice_ivr_phrases: voiceIvrPhrasesJson,
      };

      const composedPrompt = composePrompt({
        useCase: 'medical_claim',
        hasVoiceIvr: !!insurance.voiceIvrEnabled,
        ivrContext,
        vars: promptVars,
      });

      // Step 1: Call ElevenLabs native outbound call — handles IVR navigation natively
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
            dynamic_variables: {
              practice_name: provider.practiceName,
              npi: provider.npi,
              tax_id: provider.taxId,
              callback_number: provider.phone,
              patient_name: `${patient.firstName} ${patient.lastName}`,
              patient_dob: patient.dateOfBirth,
              member_id: patient.memberId,
              group_number: patient.groupNumber || 'N/A',
              claim_number: claim.claimNumber,
              date_of_service: claim.dateOfService,
              billed_amount: (claim.amount / 100).toFixed(2),
              cpt_codes: (claim.cptCodes || []).join(', ') || 'N/A',
              internal_call_id: callId,
              internal_claim_id: args.claimId,
              insurance_name: insurance.name,
              insurance_phone: insurance.phone,
              ivr_instructions: insurance.ivrInstructions || 'Navigate IVR using voice responses. Speak your selections clearly instead of pressing keys.',
              voice_ivr_phrases: voiceIvrPhrasesJson,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      // ElevenLabs returns { call_sid, conversation_id, ... } or similar
      const callSid = result.call_sid || result.callSid;
      const conversationId = result.conversation_id || result.conversationId;

      // 4. Update call record with ElevenLabs conversation ID and Twilio SID (if returned)
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'in_progress',
        twilioCallSid: callSid || undefined,
        elevenLabsConversationId: conversationId || undefined,
      });

      // Step 2: Tell bridge server to monitor this conversation for real-time events
      const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';
      const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || 'https://colorless-cardinal-959.convex.site';
      if (conversationId) {
        try {
          const bridgeHttpUrl = BRIDGE_URL.replace('wss://', 'https://').replace('ws://', 'http://');
          await fetch(`${bridgeHttpUrl}/start-monitor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              callId,
              convexSiteUrl: CONVEX_SITE_URL,
            }),
          });
        } catch (e: any) {
          console.error('Failed to start monitor (non-fatal):', e.message);
        }
      }

      // Step 3: Attach a passive Twilio monitor stream for browser audio listening
      // First attempt after 1s (fast calls), then every 5s up to 6 total attempts
      if (callSid && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        const authHeader = 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1000 : 5000));
          try {
            // Check if call is still active before attempting stream
            const callStatusRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
              { headers: { 'Authorization': authHeader } }
            );
            if (callStatusRes.ok) {
              const callData = await callStatusRes.json();
              const status = callData.status;
              console.log(`[stream-retry] Attempt ${attempt + 1}: callSid=${callSid} status=${status}`);
              if (status === 'completed' || status === 'failed' || status === 'canceled' || status === 'busy' || status === 'no-answer') {
                console.log(`[stream-retry] Call already ended (${status}), skipping stream attachment`);
                break;
              }
              if (status !== 'in-progress') {
                console.log(`[stream-retry] Call not in-progress yet (${status}), retrying...`);
                continue;
              }
            }

            const streamUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}/Streams.json`;
            const streamParams = new URLSearchParams();
            streamParams.append('Url', `${BRIDGE_URL}/monitor`);
            streamParams.append('Track', 'both_tracks');
            streamParams.append('Name', `monitor-${callId}`);
            streamParams.append('Parameter1.Name', 'callId');
            streamParams.append('Parameter1.Value', callId);

            const streamRes = await fetch(streamUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: streamParams.toString(),
            });
            const streamBody = await streamRes.text();
            console.log(`Twilio Streams: ${streamRes.status} for callSid=${callSid}`, streamBody.substring(0, 200));
            if (streamRes.ok) {
              console.log(`[stream-retry] Stream attached successfully on attempt ${attempt + 1}`);
              break;
            }
          } catch (streamErr: any) {
            console.error(`[stream-retry] Attempt ${attempt + 1} failed:`, streamErr.message);
          }
        }
      }

      // 5. Update claim
      await ctx.runMutation(api.claims.update, {
        id: args.claimId,
        lastCalledAt: new Date().toISOString(),
        status: claim.status === 'pending' ? 'in_progress' : claim.status,
      });

      return { success: true, callId, twilioCallSid: callSid, conversationId };
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

export const initiateCallWithIvr = action({
  args: {
    claimId: v.id('claims'),
  },
  handler: async (ctx, args): Promise<{ success: boolean; callId: string; twilioCallSid?: string }> => {
    const identity = await ctx.auth.getUserIdentity();

    // 1. Fetch claim with all related data
    const data: any = await ctx.runQuery(api.claims.getWithDetails, { id: args.claimId });
    if (!data || !data.claim) throw new Error('Claim not found');

    const { claim, patient, insurance, provider } = data;
    if (!patient || !insurance || !provider) {
      throw new Error('Missing patient, insurance, or provider data for this claim');
    }

    if (!insurance.ivrEnabled || !insurance.ivrSequence) {
      throw new Error('IVR is not configured for this insurance contact');
    }

    // 2. Create call record
    const callId: any = await ctx.runMutation(api.calls.create, {
      claimId: args.claimId,
      insuranceContactId: claim.insuranceContactId,
      status: 'initiating',
      startedAt: new Date().toISOString(),
    });

    // Stamp useCase on the call (calls.create has narrow args)
    await ctx.runMutation(internal.callActions.patchCallUseCase, {
      callId,
      useCase: 'medical_claim',
    });

    // 3. Call Twilio REST API to initiate outbound call with DTMF
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
    const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || 'https://colorless-cardinal-959.convex.site';
    const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'failed',
        errorMessage: 'Missing Twilio credentials in environment variables',
      });
      throw new Error('Twilio not configured');
    }

    try {
      // Build TwiML URL with query params for call context
      const twimlUrl = `${CONVEX_SITE_URL}/twiml-hold-loop?callId=${callId}&claimId=${args.claimId}`;
      const statusCallbackUrl = `${CONVEX_SITE_URL}/twilio-status`;

      // Twilio REST API - Create call with sendDigits for IVR navigation
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
      const authHeader = 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

      const params = new URLSearchParams();
      params.append('To', insurance.phone);
      params.append('From', TWILIO_PHONE_NUMBER);
      params.append('Url', twimlUrl);
      params.append('SendDigits', insurance.ivrSequence);
      params.append('StatusCallback', statusCallbackUrl);
      params.append('StatusCallbackEvent', 'initiated ringing answered completed');
      params.append('Timeout', '60');

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Twilio API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // 4. Update call record with Twilio SID and IVR info
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'in_progress',
        twilioCallSid: result.sid,
        callPhase: 'ivr',
        ivrSequenceUsed: insurance.ivrSequence,
      });

      // 5. Update claim
      await ctx.runMutation(api.claims.update, {
        id: args.claimId,
        lastCalledAt: new Date().toISOString(),
        status: claim.status === 'pending' ? 'in_progress' : claim.status,
      });

      return { success: true, callId, twilioCallSid: result.sid };
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

export const analyzeTranscript = action({
  args: {
    callId: v.id('calls'),
    claimId: v.id('claims'),
    transcript: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OpenAI API key');
    }

    // Get claim details for context
    const claimData = await ctx.runQuery(api.claims.getWithDetails, { id: args.claimId });
    const claimContext = claimData?.claim
      ? `Claim Number: ${claimData.claim.claimNumber}, Patient: ${claimData.patient?.firstName} ${claimData.patient?.lastName}, Insurance: ${claimData.insurance?.name}, Billed Amount: $${(claimData.claim.amount / 100).toFixed(2)}, Date of Service: ${claimData.claim.dateOfService}`
      : '';
    const today = new Date().toISOString().split('T')[0];

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
            content: `You are a medical billing data extraction specialist. You analyze phone call transcripts between healthcare billing agents and insurance company representatives to extract structured claim status data.

Today's date is ${today}.
Claim context: ${claimContext}

IMPORTANT RULES:
- Only extract information that was EXPLICITLY stated in the transcript. Never guess or infer.
- For relative dates like "tomorrow", "next week", "in 3 days", calculate the actual date based on today (${today}).
- If the insurance rep gave a clear status (paid, denied, pending, processing), use it. If they were vague or non-committal, use "pending_review".
- If the rep said something like "it will be ready by [date/time]" without giving a definitive status, that means the claim is still being processed — use "processing" and set expectedDecisionDate.
- For paidAmount, convert dollar amounts to cents (e.g., $500.00 = 50000). Only set this if a specific payment amount was confirmed.
- For denial codes, only use official CARC codes (e.g., CO-45, PR-96). Don't invent codes.
- referenceNumber should be a call reference number given by the rep, NOT the claim number itself.
- repName should be the name or ID of the insurance representative who handled the call.
- nextSteps should be a concise, actionable recommendation based on what was discussed.

Return a JSON object with ONLY these fields:
{
  "claimStatus": "processing|paid|denied|pending_review|no_record|voicemail|ivr_only|no_answer|unknown",
  "paidAmount": null,
  "paidDate": null,
  "checkOrEftNumber": null,
  "denialCode": null,
  "remarkCode": null,
  "denialReason": null,
  "appealDeadline": null,
  "missingDocuments": null,
  "expectedDecisionDate": null,
  "referenceNumber": null,
  "repName": null,
  "nextSteps": "string"
}

Use null for any field where the information was NOT explicitly provided in the call.

SPECIAL STATUSES:
- Use "voicemail" if the call went to voicemail or an answering machine
- Use "ivr_only" if the agent only reached an automated IVR system and never spoke to a human
- Use "no_answer" if the call rang but nobody answered
- Use "unknown" ONLY as a last resort when none of the above apply`,
          },
          {
            role: 'user',
            content: `Transcript:\n${args.transcript}`,
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
    let extraction;
    try {
      extraction = JSON.parse(result.choices[0].message.content);
    } catch {
      extraction = {
        claimStatus: 'unknown',
        nextSteps: 'Manual review required - could not parse transcript',
        confidence: 0,
      };
    }

    // Auto-generate a reference number for this call
    const now = new Date();
    const autoRef = `REF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const referenceNumber = extraction.referenceNumber || autoRef;

    // Store the extraction result — use ?? undefined so falsy values like 0 still pass through
    await ctx.runMutation(api.callResults.create, {
      callId: args.callId,
      claimId: args.claimId,
      claimStatus: extraction.claimStatus ?? undefined,
      paidAmount: extraction.paidAmount != null ? extraction.paidAmount : undefined,
      paidDate: extraction.paidDate ?? undefined,
      checkOrEftNumber: extraction.checkOrEftNumber ?? undefined,
      denialCode: extraction.denialCode ?? undefined,
      remarkCode: extraction.remarkCode ?? undefined,
      denialReason: extraction.denialReason ?? undefined,
      appealDeadline: extraction.appealDeadline ?? undefined,
      missingDocuments: extraction.missingDocuments ?? undefined,
      expectedDecisionDate: extraction.expectedDecisionDate ?? undefined,
      referenceNumber,
      repName: extraction.repName ?? undefined,
      nextSteps: extraction.nextSteps ?? undefined,
      rawExtraction: JSON.stringify(extraction),
      confidence: extraction.confidence != null ? extraction.confidence : undefined,
    });

    // Auto-update claim status
    const statusUpdate: any = {
      id: args.claimId,
      status: 'in_progress',
    };

    if (extraction.claimStatus === 'paid') {
      statusUpdate.status = 'paid';
    } else if (extraction.claimStatus === 'denied') {
      statusUpdate.status = 'denied';
      if (extraction.denialCode) statusUpdate.denialCode = extraction.denialCode;
      if (extraction.denialReason) statusUpdate.denialReason = extraction.denialReason;
      if (extraction.remarkCode) statusUpdate.remarkCode = extraction.remarkCode;
      if (extraction.appealDeadline) statusUpdate.appealDeadline = extraction.appealDeadline;
    }

    statusUpdate.referenceNumber = referenceNumber;
    if (extraction.expectedDecisionDate) {
      statusUpdate.nextFollowUpDate = extraction.expectedDecisionDate;
    }

    await ctx.runMutation(api.claims.updateStatus, statusUpdate);

    // Classify outcome (RFP requirement: 100% required-field retrieval = success)
    const callRow = await ctx.runQuery(api.calls.getById, { id: args.callId });
    const parsedForClass = { ...extraction, referenceNumber };
    const { outcome, requiredFieldsRetrieved, missingFields, reason } =
      classifyMedicalCallOutcome(parsedForClass, callRow?.status);

    await ctx.runMutation(internal.callActions.patchCallOutcome, {
      callId: args.callId,
      outcome,
      requiredFieldsRetrieved,
      missingFields,
      outcomeReason: reason,
    });

    // Audit log + webhook fanout (best-effort, non-blocking)
    try {
      await ctx.runMutation(internal.auditEvents.logEvent, {
        action: 'classify_outcome',
        resourceType: 'call',
        resourceId: args.callId,
        payloadSummary: outcome,
      });
    } catch (e: any) {
      console.error('Audit log failed (non-fatal):', e.message);
    }
    try {
      await ctx.runAction(internal.webhooks.dispatchEvent, {
        eventType: 'call.outcome_classified',
        payload: {
          callId: args.callId,
          outcome,
          requiredFieldsRetrieved,
          missingFields,
        },
      });
    } catch (e: any) {
      console.error('Webhook dispatch failed (non-fatal):', e.message);
    }

    return extraction;
  },
});

// Internal helper: patch outcome fields onto a call doc (calls.updateStatus has narrow args)
export const patchCallOutcome = internalMutation({
  args: {
    callId: v.id('calls'),
    outcome: v.string(),
    requiredFieldsRetrieved: v.array(v.string()),
    missingFields: v.array(v.string()),
    outcomeReason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      outcome: args.outcome,
      requiredFieldsRetrieved: args.requiredFieldsRetrieved,
      missingFields: args.missingFields,
      outcomeReason: args.outcomeReason,
    });
  },
});

// Internal helper: stamp useCase on a freshly-created call
export const patchCallUseCase = internalMutation({
  args: {
    callId: v.id('calls'),
    useCase: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { useCase: args.useCase });
  },
});

export const getCallStatus = action({
  args: {
    conversationId: v.string(),
    callId: v.optional(v.id('calls')),
    claimId: v.optional(v.id('claims')),
  },
  handler: async (ctx, args) => {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) return null;

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${args.conversationId}`,
        { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
      );
      if (!res.ok) return null;
      const data = await res.json();

      const isDone = data.status === 'done' || data.status === 'failed';

      // When ElevenLabs reports "done" or "failed", auto-complete the call in Convex
      if (isDone && args.callId) {
        try {
          const call = await ctx.runQuery(api.calls.getById, { id: args.callId });
          if (call && call.status === 'in_progress') {
            // Build transcript string — include tool calls (DTMF presses) for visibility
            const transcriptStr = (data.transcript || [])
              .map((t: any) => {
                const toolCalls = t.tool_calls?.filter((tc: any) => tc.tool_has_been_called) || [];
                const dtmf = toolCalls.find((tc: any) => tc.tool_name === 'play_keypad_touch_tone');
                if (dtmf) {
                  try {
                    const params = JSON.parse(dtmf.params_as_json);
                    return `agent: [pressed ${params.dtmf_tones}] ${params.reason || ''}`.trim();
                  } catch { return null; }
                }
                if (!t.message || t.message === '...') return null;
                return `${t.role}: ${t.message}`;
              })
              .filter(Boolean)
              .join('\n');

            // Calculate duration — use ElevenLabs metadata or compute from startedAt
            const elDuration = data.metadata?.call_duration_secs;
            const computedDuration = call.startedAt
              ? Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000)
              : undefined;

            // Mark call completed WITH transcript and duration
            await ctx.runMutation(api.calls.updateStatus, {
              id: args.callId,
              status: 'completed',
              completedAt: new Date().toISOString(),
              duration: elDuration || computedDuration || undefined,
              transcript: transcriptStr || undefined,
            });

            // Trigger transcript analysis if we have transcript + claimId
            if (transcriptStr && args.claimId) {
              try {
                await ctx.runAction(api.callActions.analyzeTranscript, {
                  callId: args.callId,
                  claimId: args.claimId,
                  transcript: transcriptStr,
                  userId: call.userId,
                });
              } catch (analysisErr: any) {
                console.error('Transcript analysis failed:', analysisErr.message);
              }
            }
          }
        } catch (e: any) {
          console.error('Failed to auto-complete call:', e.message);
        }
      }

      return {
        status: data.status,
        duration: data.metadata?.call_duration_secs || 0,
        transcript: (data.transcript || []).map((t: any) => ({
          role: t.role,
          message: t.message || null,
        })),
        analysis: data.analysis ? {
          successful: data.analysis.call_successful,
          summary: data.analysis.transcript_summary,
        } : null,
      };
    } catch {
      return null;
    }
  },
});

export const endCall = action({
  args: {
    callId: v.id('calls'),
  },
  handler: async (ctx, args) => {
    // 1. Get the call record
    const call = await ctx.runQuery(api.calls.getById, { id: args.callId });
    if (!call) throw new Error('Call not found');
    if (call.status === 'completed' || call.status === 'failed') {
      return { success: true, message: 'Call already ended' };
    }

    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

    // 2. Terminate via Twilio API if we have a SID
    if (call.twilioCallSid && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${call.twilioCallSid}.json`;
        const params = new URLSearchParams();
        params.append('Status', 'completed');
        const twilioRes = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        console.log(`[endCall] Twilio hangup ${call.twilioCallSid} → ${twilioRes.status}`);
        if (!twilioRes.ok) {
          const body = await twilioRes.text();
          console.error(`[endCall] Twilio hangup failed (${twilioRes.status}):`, body);
        }
      } catch (e: any) {
        console.error('[endCall] Failed to terminate Twilio call:', e.message);
      }
    } else {
      console.warn('[endCall] No twilioCallSid or missing Twilio credentials — skipping hangup', {
        hasSid: !!call.twilioCallSid,
        hasCreds: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN),
      });
    }

    // 2b. Signal ElevenLabs to end the conversation explicitly
    if (call.elevenLabsConversationId && ELEVENLABS_API_KEY) {
      try {
        const elRes = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${call.elevenLabsConversationId}`,
          { method: 'DELETE', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
        );
        console.log(`[endCall] ElevenLabs conversation end ${call.elevenLabsConversationId} → ${elRes.status}`);
      } catch (e: any) {
        console.error('[endCall] Failed to end ElevenLabs conversation:', e.message);
      }
    }

    // 3. Fetch transcript from ElevenLabs (wait 3s for it to finalize)
    let transcriptStr = '';
    let duration: number | undefined;

    if (call.elevenLabsConversationId && ELEVENLABS_API_KEY) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${call.elevenLabsConversationId}`,
          { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
        );
        if (res.ok) {
          const data = await res.json();
          duration = data.metadata?.call_duration_secs;

          transcriptStr = (data.transcript || [])
            .map((t: any) => {
              const toolCalls = t.tool_calls?.filter((tc: any) => tc.tool_has_been_called) || [];
              const dtmf = toolCalls.find((tc: any) => tc.tool_name === 'play_keypad_touch_tone');
              if (dtmf) {
                try {
                  const params = JSON.parse(dtmf.params_as_json);
                  return `agent: [pressed ${params.dtmf_tones}] ${params.reason || ''}`.trim();
                } catch { return null; }
              }
              if (!t.message || t.message === '...') return null;
              return `${t.role}: ${t.message}`;
            })
            .filter(Boolean)
            .join('\n');
        }
      } catch (e: any) {
        console.error('Failed to fetch ElevenLabs transcript on endCall:', e.message);
      }
    }

    // 4. Mark call completed — with transcript if we got it
    const computedDuration = call.startedAt
      ? Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000)
      : undefined;

    await ctx.runMutation(api.calls.updateStatus, {
      id: args.callId,
      status: 'completed',
      completedAt: new Date().toISOString(),
      duration: duration || computedDuration,
      transcript: transcriptStr || undefined,
    });

    // 5. Trigger transcript analysis based on call type
    if (transcriptStr) {
      try {
        if (call.sessionId) {
          await ctx.runAction(api.callSessions.analyzeSessionTranscript, {
            sessionId: call.sessionId,
            callId: args.callId,
            transcript: transcriptStr,
            userId: call.userId || 'default',
          });
        } else if (call.claimId) {
          await ctx.runAction(api.callActions.analyzeTranscript, {
            callId: args.callId,
            claimId: call.claimId,
            transcript: transcriptStr,
            userId: call.userId,
          });
        } else if (call.dentalCaseId) {
          await ctx.runAction(api.dentalCallActions.analyzeEvTranscript, {
            callId: args.callId,
          });
        }
      } catch (analysisErr: any) {
        console.error('Transcript analysis failed after endCall:', analysisErr.message);
      }
    }

    return { success: true, hasTranscript: !!transcriptStr };
  },
});
