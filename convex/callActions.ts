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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a medical billing data extraction specialist. Analyze the following phone call transcript between a billing agent and an insurance company representative.

Extract structured data and return a JSON object with these fields:
{
  "claimStatus": "processing|paid|denied|pending_review|no_record|unknown",
  "paidAmount": number_in_cents_or_null,
  "paidDate": "YYYY-MM-DD_or_null",
  "checkOrEftNumber": "string_or_null",
  "denialCode": "CARC_code_or_null",
  "remarkCode": "RARC_code_or_null",
  "denialReason": "string_or_null",
  "appealDeadline": "YYYY-MM-DD_or_null",
  "missingDocuments": "string_or_null",
  "expectedDecisionDate": "YYYY-MM-DD_or_null",
  "referenceNumber": "string_or_null",
  "repName": "string_or_null",
  "nextSteps": "string summarizing recommended next steps",
  "confidence": 0.0_to_1.0
}

If information was not discussed or is unclear, use null. For paidAmount, convert dollar amounts to cents (e.g., $500.00 = 50000).`,
          },
          {
            role: 'user',
            content: `Transcript:\n${args.transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
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

    // Store the extraction result
    await ctx.runMutation(api.callResults.create, {
      callId: args.callId,
      claimId: args.claimId,
      claimStatus: extraction.claimStatus || undefined,
      paidAmount: extraction.paidAmount || undefined,
      paidDate: extraction.paidDate || undefined,
      checkOrEftNumber: extraction.checkOrEftNumber || undefined,
      denialCode: extraction.denialCode || undefined,
      remarkCode: extraction.remarkCode || undefined,
      denialReason: extraction.denialReason || undefined,
      appealDeadline: extraction.appealDeadline || undefined,
      missingDocuments: extraction.missingDocuments || undefined,
      expectedDecisionDate: extraction.expectedDecisionDate || undefined,
      referenceNumber: extraction.referenceNumber || undefined,
      repName: extraction.repName || undefined,
      nextSteps: extraction.nextSteps || undefined,
      rawExtraction: JSON.stringify(extraction),
      confidence: extraction.confidence || undefined,
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

    if (extraction.referenceNumber) {
      statusUpdate.referenceNumber = extraction.referenceNumber;
    }
    if (extraction.expectedDecisionDate) {
      statusUpdate.nextFollowUpDate = extraction.expectedDecisionDate;
    }

    await ctx.runMutation(api.claims.updateStatus, statusUpdate);

    return extraction;
  },
});
