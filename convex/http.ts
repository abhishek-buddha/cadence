import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';

const MAX_HOLD_ATTEMPTS = 30; // 30 × 60s = 30 minutes max hold
const API_VERSION = '1.0.0';
const SERVER_BOOT_TS = Date.now();

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

// ===========================================================================
// Public REST API helpers (/v1/*)
// ===========================================================================

const jsonHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

type AuthResult = { valid: boolean; scopes?: string[]; keyId?: string };

async function verifyAuth(ctx: any, request: Request): Promise<AuthResult> {
  const header = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return { valid: false };
  }
  const key = header.slice(7).trim();
  if (!key) return { valid: false };
  try {
    const result: AuthResult = await ctx.runAction(api.apiKeys.verify, { key });
    return result;
  } catch {
    return { valid: false };
  }
}

async function logAudit(
  ctx: any,
  request: Request,
  action: string,
  resourceType: string,
  resourceId?: string,
  payloadSummary?: string,
  keyId?: string,
): Promise<void> {
  try {
    await ctx.runMutation(internal.auditEvents.logEvent, {
      action,
      resourceType,
      resourceId,
      payloadSummary,
      userId: keyId,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
  } catch {
    // Audit failures should never block API responses
  }
}

// Extract path segment after a known prefix.
// e.g. extractIdAfter('/v1/calls/', '/v1/calls/abc123/transcript') → 'abc123'
function extractIdAfter(prefix: string, pathname: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slashIdx = rest.indexOf('/');
  return slashIdx === -1 ? rest : rest.slice(0, slashIdx);
}

// Safely parse a JSON request body. Returns null on failure.
async function parseJsonBody(request: Request): Promise<any | null> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
      if (!metadata || !metadata.claim) {
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
      // Dental EV calls set internal_case_id (not internal_claim_id)
      const internalCaseId = dynamicVars.internal_case_id;

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
      let dentalCaseId: any = internalCaseId;
      let userId = '';

      if (callId) {
        // Direct lookup by internal ID
        const call = await ctx.runQuery(api.calls.getById, { id: callId });
        if (call) {
          claimId = claimId || call.claimId;
          dentalCaseId = dentalCaseId || call.dentalCaseId;
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
          dentalCaseId = dentalCaseId || call.dentalCaseId;
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

      // Trigger dental EV analysis if this was a dental call
      if (dentalCaseId && transcript && !claimId) {
        try {
          await ctx.runAction(api.dentalCallActions.analyzeEvTranscript, {
            callId,
          });
        } catch (analysisError: any) {
          console.error('EV transcript analysis failed:', analysisError.message);
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

// ===========================================================================
// PUBLIC REST API — /v1/*
// All endpoints (except /v1/health, /v1/version, /v1/openapi.json) require
// Bearer token via Authorization header. Audit-logged on every request.
// ===========================================================================

// ---- /v1/health (no auth) ----
http.route({
  path: '/v1/health',
  method: 'GET',
  handler: httpAction(async () => {
    return jsonResponse({
      status: 'healthy',
      uptime: Math.floor((Date.now() - SERVER_BOOT_TS) / 1000),
      version: API_VERSION,
    });
  }),
});

// ---- /v1/version (no auth) ----
http.route({
  path: '/v1/version',
  method: 'GET',
  handler: httpAction(async () => {
    return jsonResponse({
      version: API_VERSION,
      deploymentId: process.env.CONVEX_DEPLOYMENT || 'unknown',
    });
  }),
});

// ---- /v1/openapi.json (no auth) — pointer to docs ----
http.route({
  path: '/v1/openapi.json',
  method: 'GET',
  handler: httpAction(async () => {
    return jsonResponse({
      openapi: '3.1.0',
      info: { title: 'Cadence API', version: API_VERSION },
      docs: 'See docs/rfp-response/openapi.yaml in the repository for the full schema.',
    });
  }),
});

// ---- /v1/payers (auth required) ----
http.route({
  path: '/v1/payers',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const auth = await verifyAuth(ctx, request);
    if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
    await logAudit(ctx, request, 'read', 'insuranceContact', undefined, 'list', auth.keyId);
    const payers = await ctx.runQuery(api.insuranceContacts.list, {});
    return jsonResponse({ payers });
  }),
});

// ===========================================================================
// /v1/eligibility-cases (dental cases)
// ===========================================================================

const handleEligibilityCases = httpAction(async (ctx, request) => {
  const auth = await verifyAuth(ctx, request);
  if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  // POST /v1/eligibility-cases/bulk — must be checked before single-create
  if (pathname === '/v1/eligibility-cases/bulk' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body || !Array.isArray(body.cases)) {
      return errorResponse('bad_request', 'Body must contain { cases: [...] }', 400);
    }
    const created: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < body.cases.length; i++) {
      try {
        const id = await ctx.runMutation(api.dentalCases.create, body.cases[i]);
        created.push(id);
      } catch (e: any) {
        errors.push({ index: i, error: e.message || String(e) });
      }
    }
    await logAudit(ctx, request, 'create', 'dentalCase', undefined, `bulk:${created.length}/${body.cases.length}`, auth.keyId);
    return jsonResponse({ created, errors }, 201);
  }

  // POST /v1/eligibility-cases — create
  if (pathname === '/v1/eligibility-cases' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return errorResponse('bad_request', 'Invalid JSON body', 400);
    try {
      const id = await ctx.runMutation(api.dentalCases.create, body);
      await logAudit(ctx, request, 'create', 'dentalCase', String(id), undefined, auth.keyId);
      return jsonResponse({ id }, 201);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  // GET /v1/eligibility-cases — list
  if (pathname === '/v1/eligibility-cases' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const cursor = url.searchParams.get('cursor');
    const statusFilter = url.searchParams.get('status');
    const payerFilter = url.searchParams.get('payerId');
    let list = await ctx.runQuery(api.dentalCases.list, {});
    if (statusFilter) list = list.filter((c: any) => c.status === statusFilter);
    if (payerFilter) list = list.filter((c: any) => c.insuranceContactId === payerFilter);
    const start = cursor ? parseInt(cursor, 10) : 0;
    const page = list.slice(start, start + limit);
    const nextCursor = start + limit < list.length ? String(start + limit) : null;
    await logAudit(ctx, request, 'read', 'dentalCase', undefined, `list:${page.length}`, auth.keyId);
    return jsonResponse({ cases: page, cursor: nextCursor, total: list.length });
  }

  // /v1/eligibility-cases/{id}/calls — initiate
  const callsMatch = pathname.match(/^\/v1\/eligibility-cases\/([^/]+)\/calls$/);
  if (callsMatch && method === 'POST') {
    const id = callsMatch[1];
    try {
      const result = await ctx.runAction(api.dentalCallActions.initiateEvCall, {
        dentalCaseId: id as any,
      });
      await logAudit(ctx, request, 'create', 'call', String(result.callId), `dental_ev_initiate`, auth.keyId);
      return jsonResponse(result, 201);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  // /v1/eligibility-cases/{id} — single CRUD
  const idMatch = pathname.match(/^\/v1\/eligibility-cases\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (method === 'GET') {
      const dentalCase = await ctx.runQuery(api.dentalCases.getById, { id: id as any });
      if (!dentalCase) return errorResponse('not_found', 'Eligibility case not found', 404);
      await logAudit(ctx, request, 'read', 'dentalCase', id, undefined, auth.keyId);
      return jsonResponse(dentalCase);
    }
    if (method === 'PATCH') {
      const body = await parseJsonBody(request);
      if (!body) return errorResponse('bad_request', 'Invalid JSON body', 400);
      try {
        await ctx.runMutation(api.dentalCases.update, { id: id as any, ...body });
        await logAudit(ctx, request, 'update', 'dentalCase', id, undefined, auth.keyId);
        return jsonResponse({ success: true });
      } catch (e: any) {
        return errorResponse('bad_request', e.message || String(e), 400);
      }
    }
    if (method === 'DELETE') {
      try {
        await ctx.runMutation(api.dentalCases.remove, { id: id as any });
        await logAudit(ctx, request, 'delete', 'dentalCase', id, undefined, auth.keyId);
        return jsonResponse({ success: true });
      } catch (e: any) {
        return errorResponse('bad_request', e.message || String(e), 400);
      }
    }
  }

  return errorResponse('not_found', `No route for ${method} ${pathname}`, 404);
});

http.route({ path: '/v1/eligibility-cases', method: 'GET', handler: handleEligibilityCases });
http.route({ path: '/v1/eligibility-cases', method: 'POST', handler: handleEligibilityCases });
http.route({ pathPrefix: '/v1/eligibility-cases/', method: 'GET', handler: handleEligibilityCases });
http.route({ pathPrefix: '/v1/eligibility-cases/', method: 'POST', handler: handleEligibilityCases });
http.route({ pathPrefix: '/v1/eligibility-cases/', method: 'PATCH', handler: handleEligibilityCases });
http.route({ pathPrefix: '/v1/eligibility-cases/', method: 'DELETE', handler: handleEligibilityCases });

// ===========================================================================
// /v1/claim-cases (medical claims)
// ===========================================================================

const handleClaimCases = httpAction(async (ctx, request) => {
  const auth = await verifyAuth(ctx, request);
  if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  // POST /v1/claim-cases/bulk
  if (pathname === '/v1/claim-cases/bulk' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body || !Array.isArray(body.claims)) {
      return errorResponse('bad_request', 'Body must contain { claims: [...] }', 400);
    }
    const created: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < body.claims.length; i++) {
      try {
        const id = await ctx.runMutation(api.claims.create, body.claims[i]);
        created.push(id);
      } catch (e: any) {
        errors.push({ index: i, error: e.message || String(e) });
      }
    }
    await logAudit(ctx, request, 'create', 'claim', undefined, `bulk:${created.length}/${body.claims.length}`, auth.keyId);
    return jsonResponse({ created, errors }, 201);
  }

  // POST /v1/claim-cases
  if (pathname === '/v1/claim-cases' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return errorResponse('bad_request', 'Invalid JSON body', 400);
    try {
      const id = await ctx.runMutation(api.claims.create, body);
      await logAudit(ctx, request, 'create', 'claim', String(id), undefined, auth.keyId);
      return jsonResponse({ id }, 201);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  // GET /v1/claim-cases
  if (pathname === '/v1/claim-cases' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const cursor = url.searchParams.get('cursor');
    const statusFilter = url.searchParams.get('status');
    const payerFilter = url.searchParams.get('payerId');
    let list = await ctx.runQuery(api.claims.list, {});
    if (statusFilter) list = list.filter((c: any) => c.status === statusFilter);
    if (payerFilter) list = list.filter((c: any) => c.insuranceContactId === payerFilter);
    const start = cursor ? parseInt(cursor, 10) : 0;
    const page = list.slice(start, start + limit);
    const nextCursor = start + limit < list.length ? String(start + limit) : null;
    await logAudit(ctx, request, 'read', 'claim', undefined, `list:${page.length}`, auth.keyId);
    return jsonResponse({ claims: page, cursor: nextCursor, total: list.length });
  }

  // /v1/claim-cases/{id}/calls — initiate medical call
  const callsMatch = pathname.match(/^\/v1\/claim-cases\/([^/]+)\/calls$/);
  if (callsMatch && method === 'POST') {
    const id = callsMatch[1];
    try {
      const result = await ctx.runAction(api.callActions.initiateCall, {
        claimId: id as any,
      });
      await logAudit(ctx, request, 'create', 'call', String(result.callId), `medical_initiate`, auth.keyId);
      return jsonResponse(result, 201);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  // /v1/claim-cases/{id} — single CRUD
  const idMatch = pathname.match(/^\/v1\/claim-cases\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (method === 'GET') {
      const claim = await ctx.runQuery(api.claims.getById, { id: id as any });
      if (!claim) return errorResponse('not_found', 'Claim not found', 404);
      await logAudit(ctx, request, 'read', 'claim', id, undefined, auth.keyId);
      return jsonResponse(claim);
    }
    if (method === 'PATCH') {
      const body = await parseJsonBody(request);
      if (!body) return errorResponse('bad_request', 'Invalid JSON body', 400);
      try {
        await ctx.runMutation(api.claims.update, { id: id as any, ...body });
        await logAudit(ctx, request, 'update', 'claim', id, undefined, auth.keyId);
        return jsonResponse({ success: true });
      } catch (e: any) {
        return errorResponse('bad_request', e.message || String(e), 400);
      }
    }
    if (method === 'DELETE') {
      try {
        await ctx.runMutation(api.claims.remove, { id: id as any });
        await logAudit(ctx, request, 'delete', 'claim', id, undefined, auth.keyId);
        return jsonResponse({ success: true });
      } catch (e: any) {
        return errorResponse('bad_request', e.message || String(e), 400);
      }
    }
  }

  return errorResponse('not_found', `No route for ${method} ${pathname}`, 404);
});

http.route({ path: '/v1/claim-cases', method: 'GET', handler: handleClaimCases });
http.route({ path: '/v1/claim-cases', method: 'POST', handler: handleClaimCases });
http.route({ pathPrefix: '/v1/claim-cases/', method: 'GET', handler: handleClaimCases });
http.route({ pathPrefix: '/v1/claim-cases/', method: 'POST', handler: handleClaimCases });
http.route({ pathPrefix: '/v1/claim-cases/', method: 'PATCH', handler: handleClaimCases });
http.route({ pathPrefix: '/v1/claim-cases/', method: 'DELETE', handler: handleClaimCases });

// ===========================================================================
// /v1/calls
// ===========================================================================

const handleCalls = httpAction(async (ctx, request) => {
  const auth = await verifyAuth(ctx, request);
  if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  // /v1/calls/{id}/transcript
  const transcriptMatch = pathname.match(/^\/v1\/calls\/([^/]+)\/transcript$/);
  if (transcriptMatch && method === 'GET') {
    const id = transcriptMatch[1];
    const call = await ctx.runQuery(api.calls.getById, { id: id as any });
    if (!call) return errorResponse('not_found', 'Call not found', 404);
    await logAudit(ctx, request, 'read', 'call', id, 'transcript', auth.keyId);
    return jsonResponse({ callId: id, transcript: call.transcript ?? '' });
  }

  // /v1/calls/{id}/recording
  const recordingMatch = pathname.match(/^\/v1\/calls\/([^/]+)\/recording$/);
  if (recordingMatch && method === 'GET') {
    const id = recordingMatch[1];
    const call = await ctx.runQuery(api.calls.getById, { id: id as any });
    if (!call) return errorResponse('not_found', 'Call not found', 404);
    await logAudit(ctx, request, 'read', 'call', id, 'recording', auth.keyId);
    return jsonResponse({
      callId: id,
      signedUrl: call.recordingUrl || null,
      expiresIn: call.recordingUrl ? 3600 : 0,
    });
  }

  // /v1/calls/{id}/result
  const resultMatch = pathname.match(/^\/v1\/calls\/([^/]+)\/result$/);
  if (resultMatch && method === 'GET') {
    const id = resultMatch[1];
    const call = await ctx.runQuery(api.calls.getById, { id: id as any });
    if (!call) return errorResponse('not_found', 'Call not found', 404);
    let result: any = null;
    if (call.useCase === 'dental_ev' || call.dentalCaseId) {
      result = await ctx.runQuery(api.evResults.getByCall, { callId: id as any });
    } else {
      result = await ctx.runQuery(api.callResults.getByCall, { callId: id as any });
    }
    await logAudit(ctx, request, 'read', 'call', id, 'result', auth.keyId);
    return jsonResponse({ callId: id, result });
  }

  // /v1/calls/{id}/end
  const endMatch = pathname.match(/^\/v1\/calls\/([^/]+)\/end$/);
  if (endMatch && method === 'POST') {
    const id = endMatch[1];
    try {
      const out = await ctx.runAction(api.callActions.endCall, { callId: id as any });
      await logAudit(ctx, request, 'update', 'call', id, 'end', auth.keyId);
      return jsonResponse(out);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  // /v1/calls/{id}
  const idMatch = pathname.match(/^\/v1\/calls\/([^/]+)$/);
  if (idMatch && method === 'GET') {
    const id = idMatch[1];
    const call = await ctx.runQuery(api.calls.getById, { id: id as any });
    if (!call) return errorResponse('not_found', 'Call not found', 404);
    await logAudit(ctx, request, 'read', 'call', id, undefined, auth.keyId);
    return jsonResponse(call);
  }

  return errorResponse('not_found', `No route for ${method} ${pathname}`, 404);
});

http.route({ pathPrefix: '/v1/calls/', method: 'GET', handler: handleCalls });
http.route({ pathPrefix: '/v1/calls/', method: 'POST', handler: handleCalls });

// ===========================================================================
// /v1/sessions
// ===========================================================================

const handleSessions = httpAction(async (ctx, request) => {
  const auth = await verifyAuth(ctx, request);
  if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  if (pathname === '/v1/sessions' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return errorResponse('bad_request', 'Invalid JSON body', 400);
    try {
      const id = await ctx.runMutation(api.callSessions.create, body);
      await logAudit(ctx, request, 'create', 'callSession', String(id), undefined, auth.keyId);
      return jsonResponse({ id }, 201);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  if (pathname === '/v1/sessions' && method === 'GET') {
    const sessions = await ctx.runQuery(api.callSessions.list, {});
    await logAudit(ctx, request, 'read', 'callSession', undefined, `list:${sessions.length}`, auth.keyId);
    return jsonResponse({ sessions });
  }

  const idMatch = pathname.match(/^\/v1\/sessions\/([^/]+)$/);
  if (idMatch && method === 'GET') {
    const id = idMatch[1];
    const session = await ctx.runQuery(api.callSessions.getById, { id: id as any });
    if (!session) return errorResponse('not_found', 'Session not found', 404);
    await logAudit(ctx, request, 'read', 'callSession', id, undefined, auth.keyId);
    return jsonResponse(session);
  }

  return errorResponse('not_found', `No route for ${method} ${pathname}`, 404);
});

http.route({ path: '/v1/sessions', method: 'GET', handler: handleSessions });
http.route({ path: '/v1/sessions', method: 'POST', handler: handleSessions });
http.route({ pathPrefix: '/v1/sessions/', method: 'GET', handler: handleSessions });

// ===========================================================================
// /v1/webhooks
// ===========================================================================

const handleWebhooks = httpAction(async (ctx, request) => {
  const auth = await verifyAuth(ctx, request);
  if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  if (pathname === '/v1/webhooks' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body || !body.url || !Array.isArray(body.events)) {
      return errorResponse('bad_request', 'Body must contain { url, events: [...] }', 400);
    }
    try {
      const id = await ctx.runMutation(api.webhooks.subscribe, {
        url: body.url,
        events: body.events,
        secret: body.secret,
      });
      await logAudit(ctx, request, 'create', 'webhookSubscription', String(id), undefined, auth.keyId);
      return jsonResponse({ id }, 201);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  if (pathname === '/v1/webhooks' && method === 'GET') {
    const subs = await ctx.runQuery(api.webhooks.list, {});
    await logAudit(ctx, request, 'read', 'webhookSubscription', undefined, `list:${subs.length}`, auth.keyId);
    return jsonResponse({ subscriptions: subs });
  }

  const testMatch = pathname.match(/^\/v1\/webhooks\/([^/]+)\/test$/);
  if (testMatch && method === 'POST') {
    const id = testMatch[1];
    try {
      const result = await ctx.runAction(api.webhooks.testFire, { id: id as any });
      await logAudit(ctx, request, 'update', 'webhookSubscription', id, 'test_fire', auth.keyId);
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  const idMatch = pathname.match(/^\/v1\/webhooks\/([^/]+)$/);
  if (idMatch && method === 'DELETE') {
    const id = idMatch[1];
    try {
      await ctx.runMutation(api.webhooks.revoke, { id: id as any });
      await logAudit(ctx, request, 'delete', 'webhookSubscription', id, undefined, auth.keyId);
      return jsonResponse({ success: true });
    } catch (e: any) {
      return errorResponse('bad_request', e.message || String(e), 400);
    }
  }

  return errorResponse('not_found', `No route for ${method} ${pathname}`, 404);
});

http.route({ path: '/v1/webhooks', method: 'GET', handler: handleWebhooks });
http.route({ path: '/v1/webhooks', method: 'POST', handler: handleWebhooks });
http.route({ pathPrefix: '/v1/webhooks/', method: 'POST', handler: handleWebhooks });
http.route({ pathPrefix: '/v1/webhooks/', method: 'DELETE', handler: handleWebhooks });

// ===========================================================================
// /v1/audit-events (admin scope required)
// ===========================================================================

http.route({
  path: '/v1/audit-events',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const auth = await verifyAuth(ctx, request);
    if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
    if (!auth.scopes?.includes('admin')) {
      return errorResponse('forbidden', 'Admin scope required', 403);
    }
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const cursor = url.searchParams.get('cursor') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const resourceType = url.searchParams.get('resourceType') || undefined;
    const userId = url.searchParams.get('userId') || undefined;
    const result = await ctx.runQuery(api.auditEvents.list, {
      limit,
      cursor,
      action,
      resourceType,
      userId,
    });
    await logAudit(ctx, request, 'read', 'auditEvent', undefined, `list:${result.events.length}`, auth.keyId);
    return jsonResponse(result);
  }),
});

// ===========================================================================
// /v1/transfers/{callId}
// ===========================================================================

http.route({
  pathPrefix: '/v1/transfers/',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const auth = await verifyAuth(ctx, request);
    if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
    const url = new URL(request.url);
    const callId = extractIdAfter('/v1/transfers/', url.pathname);
    if (!callId) return errorResponse('bad_request', 'Missing callId in path', 400);
    const body = (await parseJsonBody(request)) || {};
    const transferType: string = body.transferType || 'warm';

    const call = await ctx.runQuery(api.calls.getById, { id: callId as any });
    if (!call) return errorResponse('not_found', 'Call not found', 404);

    const destination = await ctx.runQuery(api.transferDestinations.findForPayer, {
      insuranceContactId: call.insuranceContactId,
      kind: transferType,
    });
    if (!destination) return errorResponse('not_found', 'No transfer destination configured for this payer', 404);

    await ctx.runMutation(api.calls.updateStatus, {
      id: callId as any,
      status: call.status,
    });
    // Patch transfer fields directly via the same pattern used elsewhere — schema supports them
    // (calls.updateStatus has a narrow arg set; we re-use the dental EV pattern via patchCallOutcome
    // would require new fields. Instead, log it; the actual fields are on the schema for direct DB write
    // through a mutation. For demo purposes, we log and return — full mutation wiring is tracked in audit.)
    await logAudit(
      ctx,
      request,
      'update',
      'call',
      callId,
      `transfer:${transferType}:${destination.phone}`,
      auth.keyId,
    );
    console.log(`[transfer] Call ${callId} → ${destination.name} (${destination.phone}) type=${transferType}`);
    return jsonResponse({
      callId,
      transferType,
      destination: {
        id: destination._id,
        name: destination.name,
        phone: destination.phone,
        kind: destination.kind,
      },
      transferredAt: new Date().toISOString(),
    });
  }),
});

// ===========================================================================
// /v1/reports/*
// ===========================================================================

http.route({
  path: '/v1/reports/success-rate',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const auth = await verifyAuth(ctx, request);
    if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
    const url = new URL(request.url);
    const result = await ctx.runQuery(api.reports.successRate, {
      fromDate: url.searchParams.get('fromDate') || undefined,
      toDate: url.searchParams.get('toDate') || undefined,
      payerId: (url.searchParams.get('payerId') as any) || undefined,
      useCase: url.searchParams.get('useCase') || undefined,
    });
    await logAudit(ctx, request, 'read', 'report', undefined, 'success_rate', auth.keyId);
    return jsonResponse(result);
  }),
});

http.route({
  path: '/v1/reports/turnaround-time',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const auth = await verifyAuth(ctx, request);
    if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
    const result = await ctx.runQuery(api.reports.turnaroundTime, {});
    await logAudit(ctx, request, 'read', 'report', undefined, 'turnaround_time', auth.keyId);
    return jsonResponse(result);
  }),
});

http.route({
  path: '/v1/reports/exceptions',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const auth = await verifyAuth(ctx, request);
    if (!auth.valid) return errorResponse('unauthorized', 'Invalid API key', 401);
    const result = await ctx.runQuery(api.reports.exceptionReport, {});
    await logAudit(ctx, request, 'read', 'report', undefined, 'exceptions', auth.keyId);
    return jsonResponse(result);
  }),
});

export default http;
