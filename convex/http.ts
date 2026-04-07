import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';

const MAX_HOLD_ATTEMPTS = 30; // 30 × 60s = 30 minutes max hold

const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function twimlResponse(twiml: string): Response {
  return new Response(twiml.trim(), {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

const http = httpRouter();

// ---- TwiML: Call start — sets up monitor + ElevenLabs bridge from the start ----
http.route({
  path: '/twiml-call-start',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId') || '';
    const claimId = url.searchParams.get('claimId') || '';

    const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';

    return twimlResponse(`
      <Response>
        <Start>
          <Stream url="${BRIDGE_URL}/monitor" track="both_tracks">
            <Parameter name="callId" value="${callId}"/>
          </Stream>
        </Start>
        <Connect>
          <Stream url="${BRIDGE_URL}/media-stream">
            <Parameter name="callId" value="${callId}"/>
            <Parameter name="claimId" value="${claimId}"/>
          </Stream>
        </Connect>
      </Response>
    `);
  }),
});

// Also handle GET in case Twilio sends GET for the initial TwiML fetch
http.route({
  path: '/twiml-call-start',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId') || '';
    const claimId = url.searchParams.get('claimId') || '';

    const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';

    return twimlResponse(`
      <Response>
        <Start>
          <Stream url="${BRIDGE_URL}/monitor" track="both_tracks">
            <Parameter name="callId" value="${callId}"/>
          </Stream>
        </Start>
        <Connect>
          <Stream url="${BRIDGE_URL}/media-stream">
            <Parameter name="callId" value="${callId}"/>
            <Parameter name="claimId" value="${claimId}"/>
          </Stream>
        </Connect>
      </Response>
    `);
  }),
});

// ---- TwiML: Hold loop with speech detection (Phase 2) ----
http.route({
  path: '/twiml-hold-loop',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId') || '';
    const claimId = url.searchParams.get('claimId') || '';
    const attempt = parseInt(url.searchParams.get('attempt') || '1', 10);

    const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';

    // Update call phase to "hold" on first attempt
    if (attempt === 1 && callId) {
      try {
        await ctx.runMutation(api.calls.updateStatus, {
          id: callId as any,
          status: 'in_progress',
          callPhase: 'hold',
          holdStartedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to update call phase:', e);
      }
    }

    // Exceeded max hold time — hang up
    if (attempt > MAX_HOLD_ATTEMPTS) {
      if (callId) {
        try {
          await ctx.runMutation(api.calls.updateStatus, {
            id: callId as any,
            status: 'failed',
            errorMessage: 'Hold timeout exceeded (30 minutes)',
            callPhase: 'hold_timeout',
            completedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Failed to update timeout status:', e);
        }
      }
      return twimlResponse(`
        <Response>
          <Say voice="alice">We were unable to reach a representative within the allowed hold time. The call will now end.</Say>
          <Hangup/>
        </Response>
      `);
    }

    const siteUrl = url.origin;
    const connectUrl = `${siteUrl}/twiml-connect-agent?callId=${callId}&claimId=${claimId}`;
    const nextLoopUrl = `${siteUrl}/twiml-hold-loop?callId=${callId}&claimId=${claimId}&attempt=${attempt + 1}`;

    return twimlResponse(`
      <Response>
        <Start>
          <Stream url="${BRIDGE_URL}/monitor" track="both_tracks">
            <Parameter name="callId" value="${callId}"/>
          </Stream>
        </Start>
        <Gather input="speech" timeout="55" speechTimeout="3" action="${connectUrl}" method="POST">
          <Pause length="55"/>
        </Gather>
        <Redirect method="POST">${nextLoopUrl}</Redirect>
      </Response>
    `);
  }),
});

// ---- TwiML: Connect agent (Phase 3 — human detected) ----
http.route({
  path: '/twiml-connect-agent',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId') || '';
    const claimId = url.searchParams.get('claimId') || '';

    const BRIDGE_URL = process.env.BRIDGE_SERVER_URL || 'wss://cadence-bridge.onrender.com';

    // Calculate hold duration and update call phase
    if (callId) {
      try {
        const call = await ctx.runQuery(api.calls.getById, { id: callId as any });
        const holdDuration = call?.holdStartedAt
          ? Math.round((Date.now() - new Date(call.holdStartedAt).getTime()) / 1000)
          : 0;

        await ctx.runMutation(api.calls.updateStatus, {
          id: callId as any,
          status: 'in_progress',
          callPhase: 'connecting',
          humanDetectedAt: new Date().toISOString(),
          holdDuration,
        });
      } catch (e) {
        console.error('Failed to update connecting phase:', e);
      }
    }

    return twimlResponse(`
      <Response>
        <Connect>
          <Stream url="${BRIDGE_URL}/media-stream">
            <Parameter name="callId" value="${callId}"/>
            <Parameter name="claimId" value="${claimId}"/>
          </Stream>
        </Connect>
      </Response>
    `);
  }),
});

// ---- Twilio status callback ----
http.route({
  path: '/twilio-status',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const formData = await request.text();
      const params = new URLSearchParams(formData);
      const callSid = params.get('CallSid');
      const callStatus = params.get('CallStatus'); // initiated, ringing, answered, completed, failed, busy, no-answer
      const duration = params.get('CallDuration');

      if (!callSid) {
        return new Response(JSON.stringify({ error: 'No CallSid' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Find call by Twilio SID
      const call = await ctx.runQuery(api.calls.getByTwilioSid, { twilioCallSid: callSid });
      console.log(`[twilio-status] CallSid=${callSid} Status=${callStatus} Duration=${duration} Found=${!!call}`);

      if (call) {
        if (callStatus === 'completed') {
          await ctx.runMutation(api.calls.updateStatus, {
            id: call._id,
            status: call.status === 'failed' ? 'failed' : 'completed',
            completedAt: new Date().toISOString(),
            duration: duration ? parseInt(duration, 10) : undefined,
          });
        } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
          await ctx.runMutation(api.calls.updateStatus, {
            id: call._id,
            status: 'failed',
            errorMessage: `Call ${callStatus}`,
            completedAt: new Date().toISOString(),
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('Twilio status callback error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

// ---- Call ended notification (from bridge server when WebSocket closes) ----
http.route({
  path: '/call-ended',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      return new Response(JSON.stringify({ error: 'Missing callId' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const call = await ctx.runQuery(api.calls.getById, { id: callId as any });
      if (call && (call.status === 'in_progress' || call.status === 'initiating')) {
        console.log(`[call-ended] Marking call ${callId} as completed (was ${call.status})`);
        await ctx.runMutation(api.calls.updateStatus, {
          id: callId as any,
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      console.error(`[call-ended] Error:`, e.message);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

// ---- Call metadata endpoint (used by bridge server) ----
http.route({
  path: '/call-metadata',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      return new Response(JSON.stringify({ error: 'Missing callId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const metadata = await ctx.runQuery(api.calls.getCallMetadata, { id: callId as any });
      if (!metadata) {
        return new Response(JSON.stringify({ error: 'Call not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { call, claim, patient, insurance, provider } = metadata;
      return new Response(JSON.stringify({
        callId: call._id,
        claimId: claim._id,
        dynamic_variables: {
          practice_name: provider?.practiceName || '',
          npi: provider?.npi || '',
          tax_id: provider?.taxId || '',
          callback_number: provider?.phone || '',
          patient_name: patient ? `${patient.firstName} ${patient.lastName}` : '',
          patient_dob: patient?.dateOfBirth || '',
          member_id: patient?.memberId || '',
          group_number: patient?.groupNumber || 'N/A',
          claim_number: claim.claimNumber,
          date_of_service: claim.dateOfService,
          billed_amount: (claim.amount / 100).toFixed(2),
          cpt_codes: (claim.cptCodes || []).join(', ') || 'N/A',
          internal_call_id: call._id,
          internal_claim_id: claim._id,
        },
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

// ---- CORS preflight for call-metadata ----
http.route({
  path: '/call-metadata',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }),
});

// ---- Real-time call events (from bridge server monitoring ElevenLabs conversations) ----
http.route({
  path: '/call-events',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, type, message } = body;
      if (!callId || !type) {
        return new Response(JSON.stringify({ error: 'Missing callId or type' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      await ctx.runMutation(api.callEvents.addEvent, {
        callId,
        type,
        message: message || undefined,
        timestamp: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (error: any) {
      console.error('[call-events] Error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});

// CORS preflight for call-events
http.route({
  path: '/call-events',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }),
});

// ---- ElevenLabs webhook (existing) ----
http.route({
  path: '/elevenlabs-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();

      // Extract conversation ID
      const conversationId =
        body.data?.conversation_id || body.conversation_id || body.id;

      // Extract dynamic variables (contain our internal IDs)
      const dynamicVars =
        body.data?.conversation_initiation_client_data?.dynamic_variables ||
        body.conversation_initiation_client_data?.dynamic_variables ||
        {};

      const internalCallId = dynamicVars.internal_call_id;
      const internalClaimId = dynamicVars.internal_claim_id;

      // Build transcript from array
      const transcriptArr = body.data?.transcript || body.transcript || [];
      const transcript = Array.isArray(transcriptArr)
        ? transcriptArr
            .map((t: any) => `${t.role || t.speaker || 'unknown'}: ${t.message || t.text || ''}`)
            .join('\n')
        : typeof transcriptArr === 'string'
          ? transcriptArr
          : '';

      const duration =
        body.data?.metadata?.call_duration_secs ||
        body.data?.duration ||
        body.duration ||
        0;

      // Try to find the call record
      let callId = internalCallId;
      let claimId = internalClaimId;
      let userId = '';

      if (callId) {
        // Direct lookup by internal ID
        const call = await ctx.runQuery(api.calls.getById, { id: callId });
        if (call) {
          claimId = claimId || call.claimId;
          userId = call.userId;
        }
      } else if (conversationId) {
        // Fallback: lookup by ElevenLabs conversation ID
        const call = await ctx.runQuery(api.calls.getByConversationId, {
          conversationId,
        });
        if (call) {
          callId = call._id;
          claimId = call.claimId;
          userId = call.userId;
        }
      }

      if (!callId) {
        return new Response(
          JSON.stringify({ error: 'Could not find matching call record' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Update call record with transcript and completion
      await ctx.runMutation(api.calls.updateStatus, {
        id: callId,
        status: 'completed',
        transcript: transcript || undefined,
        duration: duration || undefined,
        completedAt: new Date().toISOString(),
        elevenLabsConversationId: conversationId || undefined,
      });

      // Trigger transcript analysis if we have the data
      if (claimId && transcript) {
        try {
          await ctx.runAction(api.callActions.analyzeTranscript, {
            callId,
            claimId,
            transcript,
            userId,
          });
        } catch (analysisError: any) {
          console.error('Transcript analysis failed:', analysisError.message);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('Webhook processing error:', error.message, error.stack);
      return new Response(JSON.stringify({ error: 'Processing failed', detail: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

// ===========================================================================
// TEST IVR — Simulated insurance company phone system for demo/testing
// Call +18629724303 to reach this IVR
// ===========================================================================

http.route({
  path: '/test-ivr',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const siteUrl = url.origin;

    // Read forwarding number — database first (dynamic), URL param fallback (legacy)
    let forwardNumber = '';
    try {
      const fwd = await ctx.runQuery(api.calls.getCallSetting, { key: 'forwardNumber' });
      if (fwd) forwardNumber = fwd;
    } catch (e) {
      // Fall back to URL param
    }
    if (!forwardNumber) {
      forwardNumber = url.searchParams.get('forwardNumber') || '';
    }
    const fwdParam = forwardNumber ? `?forwardNumber=${encodeURIComponent(forwardNumber)}` : '';
    return twimlResponse(`
      <Response>
        <Gather input="speech dtmf" numDigits="1" timeout="15" speechTimeout="3" action="${siteUrl}/test-ivr-level2${fwdParam}" method="POST">
          <Say voice="Polly.Joanna">Thank you for calling Acme Health Insurance, a preferred provider organization.
            Please listen carefully as our menu options have recently changed.
            For claims and billing, press 1 or say claims.
            For member services, press 2 or say member services.
            For provider relations, press 3 or say provider.
            For pharmacy, press 4.
            To repeat this menu, press 9.</Say>
        </Gather>
        <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
        <Hangup/>
      </Response>
    `);
  }),
});

http.route({
  path: '/test-ivr-level2',
  method: 'POST',
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const siteUrl = url.origin;
    const forwardNumber = url.searchParams.get('forwardNumber') || '';
    const fwdParam = forwardNumber ? `?forwardNumber=${encodeURIComponent(forwardNumber)}` : '';
    const body = await request.text();
    const params = new URLSearchParams(body);
    const digits = params.get('Digits') || '';
    const speech = (params.get('SpeechResult') || '').toLowerCase();

    // Accept ANY input to move to claims submenu (production IVRs route by digit)
    if (digits || speech) {
      return twimlResponse(`
        <Response>
          <Gather input="speech dtmf" numDigits="1" timeout="15" speechTimeout="3" action="${siteUrl}/test-ivr-hold${fwdParam}" method="POST">
            <Say voice="Polly.Joanna">You have reached the claims department.
              For claim status inquiry, press 1 or say claim status.
              To file a new claim, press 2.
              For claim appeals, press 3.
              To speak with a claims representative, press 0.</Say>
          </Gather>
          <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
          <Hangup/>
        </Response>
      `);
    }

    return twimlResponse(`
      <Response>
        <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
        <Hangup/>
      </Response>
    `);
  }),
});

http.route({
  path: '/test-ivr-hold',
  method: 'POST',
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const siteUrl = url.origin;
    const forwardNumber = url.searchParams.get('forwardNumber') || '';

    // After hold music, either dial the human agent number or fall back to TTS Michael
    const afterHold = forwardNumber
      ? `<Say voice="Polly.Joanna">Transferring you now.</Say>
         <Dial callerId="+12272573081" timeout="30">${forwardNumber}</Dial>
         <Say voice="Polly.Joanna">We were unable to reach the representative. Please try again later.</Say>
         <Hangup/>`
      : `<Gather input="speech" timeout="180" speechTimeout="auto" action="${siteUrl}/test-ivr-agent" method="POST">
          <Say voice="Polly.Matthew">Hi there, thanks so much for holding. This is Michael with the Acme Health Insurance claims department. How can I help you today?</Say>
          <Pause length="180"/>
        </Gather>
        <Say voice="Polly.Matthew">Thank you for calling. Goodbye.</Say>
        <Hangup/>`;

    return twimlResponse(`
      <Response>
        <Say voice="Polly.Joanna">Please hold while we transfer you to the next available claims representative.
          Your estimated wait time is approximately 2 minutes. Your call is important to us.</Say>
        <Play>http://com.twilio.music.soft-rock.s3.amazonaws.com/_ghost_-_promo_2_sample_pack.mp3</Play>
        <Say voice="Polly.Joanna">Thank you for your continued patience.</Say>
        <Pause length="2"/>
        ${afterHold}
      </Response>
    `);
  }),
});

http.route({
  path: '/test-ivr-agent',
  method: 'POST',
  handler: httpAction(async (_, request) => {
    const siteUrl = new URL(request.url).origin;
    const body = await request.text();
    const params = new URLSearchParams(body);
    const speech = (params.get('SpeechResult') || '').toLowerCase();

    if (speech.includes('no') || speech.includes('thank') || speech.includes('bye') || speech.includes('great') || speech.includes('good')) {
      return twimlResponse(`
        <Response>
          <Say voice="Polly.Matthew">Glad I could help! Thanks for calling Acme Health Insurance. Have a wonderful day. Goodbye!</Say>
          <Hangup/>
        </Response>
      `);
    }

    if (speech.match(/[0-9]/) || speech.includes('number') || speech.includes('clm')) {
      return twimlResponse(`
        <Response>
          <Gather input="speech" timeout="60" speechTimeout="auto" action="${siteUrl}/test-ivr-agent" method="POST">
            <Say voice="Polly.Matthew">Okay, let me look that up. One moment please.</Say>
            <Pause length="3"/>
            <Say voice="Polly.Matthew">Alright, I found that claim. It looks like it is currently in processing status.
              The claim was received on March 15th and the expected decision date is approximately 10 business days from now.
              The reference number for this call is R E F dash 2 0 2 6 0 4 0 5 dash 5 6 7 8.
              Is there anything else I can help you with today?</Say>
            <Pause length="60"/>
          </Gather>
        </Response>
      `);
    }

    // Default: ask for more info
    return twimlResponse(`
      <Response>
        <Gather input="speech" timeout="60" speechTimeout="auto" action="${siteUrl}/test-ivr-agent" method="POST">
          <Say voice="Polly.Matthew">Sure, I can help with that. Could you give me the claim number so I can look it up?</Say>
          <Pause length="60"/>
        </Gather>
      </Response>
    `);
  }),
});

export default http;
