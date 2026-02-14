import { action, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';

export const initiateCall = action({
  args: {
    claimId: v.id('claims'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // 1. Fetch claim with all related data
    const data = await ctx.runQuery(api.claims.getWithDetails, { id: args.claimId });
    if (!data || !data.claim) throw new Error('Claim not found');

    const { claim, patient, insurance, provider } = data;
    if (!patient || !insurance || !provider) {
      throw new Error('Missing patient, insurance, or provider data for this claim');
    }

    // 2. Create call record
    const callId = await ctx.runMutation(api.calls.create, {
      claimId: args.claimId,
      insuranceContactId: claim.insuranceContactId,
      status: 'initiating',
      startedAt: new Date().toISOString(),
    });

    // 3. Call ElevenLabs API to initiate outbound call
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
    const AGENT_PHONE_NUMBER_ID = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

    if (!ELEVENLABS_API_KEY || !AGENT_ID) {
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'failed',
        errorMessage: 'Missing ElevenLabs API key or Agent ID in environment variables',
      });
      throw new Error('ElevenLabs not configured');
    }

    try {
      const response = await fetch(
        'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
        {
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
                // Internal IDs for webhook correlation
                internal_call_id: callId,
                internal_claim_id: args.claimId,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // 4. Update call record with ElevenLabs IDs
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'in_progress',
        elevenLabsConversationId: result.conversation_id || undefined,
        twilioCallSid: result.callSid || undefined,
      });

      // 5. Update claim
      await ctx.runMutation(api.claims.update, {
        id: args.claimId,
        lastCalledAt: new Date().toISOString(),
        status: claim.status === 'pending' ? 'in_progress' : claim.status,
      });

      return { success: true, callId, conversationId: result.conversation_id };
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
        model: 'gpt-4.1',
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
  "claimStatus": "processing|paid|denied|pending_review|no_record|unknown",
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

Use null for any field where the information was NOT explicitly provided in the call.`,
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

    return extraction;
  },
});
