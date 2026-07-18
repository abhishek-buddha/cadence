import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import { extractHandoffDetected, buildMedicalDynamicVars } from './callActions';

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

// ===========================================================================
// LIVE AI→HUMAN HANDOFF — conference bridge TwiML (cadence_pro_ivr)
// ---------------------------------------------------------------------------
// Flow: the AI (on its ElevenLabs call) navigates the payer IVR, then on human
// handoff fires ElevenLabs' native transfer_to_number (Conference) to OUR
// bridge number (TWILIO_PHONE_NUMBER). ElevenLabs conferences that leg in with
// the insurance rep and drops the AI. Twilio delivers that leg to us as an
// inbound call → /twiml-bridge-inbound, which reads the post-dial handoff token,
// parks the rep in conference `cadence-<callId>`, and flips the call to
// handoffState="awaiting_human" (broadcast to our agents). When an agent
// accepts in the UI, their browser softphone (or a dialed leg) joins the same
// conference → human ↔ insurance human.
// ===========================================================================

// Hold audio played to the parked insurance rep while we wait for one of our
// agents to accept. Simple, polite, loops via waitUrl.
function holdTwiml(): string {
  return `
    <Response>
      <Say voice="alice">Please hold. Connecting you to a specialist now.</Say>
      <Play loop="0">https://sdk.twilio.com/js/client/sounds/releases/1.0.0/ringtone.mp3</Play>
    </Response>
  `;
}

async function closeHandoffCall(ctx: any, callId: string, duration?: number): Promise<void> {
  const call = await ctx.runQuery(api.calls.getById, { id: callId as any });
  if (!call) return;

  await ctx.runMutation(api.calls.updateStatus, {
    id: call._id,
    status: call.status === 'failed' ? 'failed' : 'completed',
    completedAt: new Date().toISOString(),
    duration,
  });

  if (
    call.handoffState &&
    ['awaiting_human', 'accepting', 'connected'].includes(call.handoffState)
  ) {
    await ctx.runMutation(internal.handoff.markHandoffEnded, { callId: call._id });
  }
}

// Entry point for the AI's Conference transfer landing on our bridge number.
// Reads the handoff token from post-dial DTMF, then redirects to the parking
// handler with the resolved token.
async function bridgeInboundHandler(ctx: any, request: Request): Promise<Response> {
  const url = new URL(request.url);
  // ElevenLabs post-dial digits arrive as DTMF; Twilio can also pass them as a
  // Digits param on the inbound webhook depending on config. Accept either.
  let token = url.searchParams.get('token') || url.searchParams.get('Digits') || '';
  if (!token) {
    try {
      const form = new URLSearchParams(await request.text());
      token = form.get('Digits') || '';
    } catch {
      // no body / not form-encoded
    }
  }
  const siteUrl = url.origin;
  // If no token yet, gather the DTMF the transfer relays, then reprocess.
  if (!token) {
    return twimlResponse(`
      <Response>
        <Gather numDigits="8" timeout="4" action="${siteUrl}/twiml-bridge-parked" method="POST"/>
        <Redirect method="POST">${siteUrl}/twiml-bridge-parked</Redirect>
      </Response>
    `);
  }
  return twimlResponse(`
    <Response>
      <Redirect method="POST">${siteUrl}/twiml-bridge-parked?token=${encodeURIComponent(token)}</Redirect>
    </Response>
  `);
}

http.route({ path: '/twiml-bridge-inbound', method: 'POST', handler: httpAction(bridgeInboundHandler) });
http.route({ path: '/twiml-bridge-inbound', method: 'GET', handler: httpAction(bridgeInboundHandler) });

// Resolve token → callId, flip to awaiting_human, park the rep in the conference.
async function bridgeParkedHandler(ctx: any, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let token = url.searchParams.get('token') || '';
  if (!token) {
    try {
      const form = new URLSearchParams(await request.text());
      token = (form.get('Digits') || '').replace(/[^0-9]/g, '');
    } catch {
      // ignore
    }
  }

  const call = await ctx.runQuery(api.handoff.resolveByToken, { token: token || undefined });
  if (!call) {
    // Couldn't correlate — keep the rep on a brief hold rather than dropping.
    return twimlResponse(holdTwiml());
  }

  // Idempotently mark awaiting_human + set conference name.
  await ctx.runMutation(internal.handoff.requestHandoff, {
    callId: call._id,
    reason: call.handoffReason || 'ivr_human_handoff_detected',
  });

  const confName = `cadence-${call._id}`;
  const siteUrl = url.origin;
  // Park the rep: they start/hold the conference but do NOT end it when the
  // holding side changes (endConferenceOnExit=false). waitUrl loops hold audio.
  //
  // Recording: record the whole conference automatically from the start
  // (record-from-start) — captures the human↔human portion for QA/audit. Set on
  // this (the first, longest-lived) leg only; Twilio records the conference
  // once regardless of how many participants set it. recordingStatusCallback
  // fires once when the conference recording is ready. The callId is threaded
  // through the callback URL so we can attach the recording to the right call.
  return twimlResponse(`
    <Response>
      <Dial>
        <Conference startConferenceOnEnter="true" endConferenceOnExit="false"
                    waitUrl="${siteUrl}/twiml-conference-hold" beep="false"
                    statusCallback="${siteUrl}/twilio-conference-status?callId=${call._id}"
                    statusCallbackEvent="end"
                    statusCallbackMethod="POST"
                    record="record-from-start"
                    recordingStatusCallback="${siteUrl}/twilio-recording-status?callId=${call._id}"
                    recordingStatusCallbackEvent="completed">
          ${confName}
        </Conference>
      </Dial>
    </Response>
  `);
}

http.route({ path: '/twiml-bridge-parked', method: 'POST', handler: httpAction(bridgeParkedHandler) });
http.route({ path: '/twiml-bridge-parked', method: 'GET', handler: httpAction(bridgeParkedHandler) });

// Hold audio (waitUrl) for the parked conference.
http.route({
  path: '/twiml-conference-hold',
  method: 'POST',
  handler: httpAction(async () => twimlResponse(holdTwiml())),
});
http.route({
  path: '/twiml-conference-hold',
  method: 'GET',
  handler: httpAction(async () => twimlResponse(holdTwiml())),
});

// Our agent's leg (dialed-number fallback path) joins the conference. When the
// agent leaves, the conference ends (endConferenceOnExit=true), dropping the rep.
async function agentJoinHandler(ctx: any, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const callId = url.searchParams.get('callId') || '';
  const confName = `cadence-${callId}`;
  const siteUrl = url.origin;
  return twimlResponse(`
    <Response>
      <Dial>
        <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false"
                    statusCallback="${siteUrl}/twilio-conference-status?callId=${callId}"
                    statusCallbackEvent="end"
                    statusCallbackMethod="POST">
          ${confName}
        </Conference>
      </Dial>
    </Response>
  `);
}
http.route({ path: '/twiml-agent-join', method: 'POST', handler: httpAction(agentJoinHandler) });
http.route({ path: '/twiml-agent-join', method: 'GET', handler: httpAction(agentJoinHandler) });

// TwiML the browser softphone (Twilio Voice SDK) requests when it places its
// outgoing call — joins the same conference so the agent talks to the rep.
// The TwiML App's Voice URL points here. The client passes `callId` as a
// custom parameter, surfaced by Twilio as a POST field.
async function softphoneOutgoingHandler(ctx: any, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let callId = url.searchParams.get('callId') || '';
  if (!callId) {
    try {
      const form = new URLSearchParams(await request.text());
      callId = form.get('callId') || '';
    } catch {
      // ignore
    }
  }
  const confName = `cadence-${callId}`;
  const siteUrl = url.origin;
  return twimlResponse(`
    <Response>
      <Dial>
        <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false"
                    statusCallback="${siteUrl}/twilio-conference-status?callId=${callId}"
                    statusCallbackEvent="end"
                    statusCallbackMethod="POST">
          ${confName}
        </Conference>
      </Dial>
    </Response>
  `);
}
http.route({ path: '/twiml-softphone-outgoing', method: 'POST', handler: httpAction(softphoneOutgoingHandler) });
http.route({ path: '/twiml-softphone-outgoing', method: 'GET', handler: httpAction(softphoneOutgoingHandler) });

// ---------------------------------------------------------------------------
// OPTION 1 — the AI drop lands here. handoff.redirectPayerToConference() POSTs
// this URL to the live payer call, which abandons its <Connect><Stream> (closing
// the bridge socket → AI dropped) and parks the payer in the conference. The
// conference records from the start (human↔human portion) and holds the payer on
// waitUrl audio until our browser agent joins. endConferenceOnExit=false so the
// payer holding here never tears the conference down.
// ---------------------------------------------------------------------------
async function payerConferenceHandler(ctx: any, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let callId = url.searchParams.get('callId') || '';
  if (!callId) {
    try {
      const form = new URLSearchParams(await request.text());
      callId = form.get('callId') || '';
    } catch {
      // ignore
    }
  }
  const confName = `cadence-${callId}`;
  const siteUrl = url.origin;
  return twimlResponse(`
    <Response>
      <Dial>
        <Conference startConferenceOnEnter="true" endConferenceOnExit="false"
                    waitUrl="${siteUrl}/twiml-conference-hold" beep="false"
                    statusCallback="${siteUrl}/twilio-conference-status?callId=${callId}"
                    statusCallbackEvent="end"
                    statusCallbackMethod="POST"
                    record="record-from-start"
                    recordingStatusCallback="${siteUrl}/twilio-recording-status?callId=${callId}"
                    recordingStatusCallbackEvent="completed">
          ${confName}
        </Conference>
      </Dial>
    </Response>
  `);
}
http.route({ path: '/twiml-payer-conference', method: 'POST', handler: httpAction(payerConferenceHandler) });
http.route({ path: '/twiml-payer-conference', method: 'GET', handler: httpAction(payerConferenceHandler) });

// ---------------------------------------------------------------------------
// Handoff trigger — the AI (in IVR-only mode) signals that the insurance human
// is on the line. This flips the call to awaiting_human and broadcasts to the
// pool. Does NOT drop the AI yet — the AI stays on a holding line with the rep
// until one of our agents accepts (see redirectPayerToConference).
//
// Correlation: prefer explicit ?callId=; else the numeric ?token= (handoffToken)
// carried by the agent; else fall back to the most-recent active call.
// ---------------------------------------------------------------------------
async function requestHandoffHandler(ctx: any, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let callId = url.searchParams.get('callId') || '';
  const token = url.searchParams.get('token') || '';
  const reason = url.searchParams.get('reason') || 'ivr_human_handoff_detected';

  if (!callId) {
    // Resolve via token / most-recent-active fallback.
    const call = await ctx.runQuery(api.handoff.resolveByToken, { token: token || undefined });
    if (call) callId = call._id;
  }
  if (!callId) {
    return jsonResponse({ ok: false, error: 'could_not_correlate_call' }, 404);
  }

  const res = await ctx.runMutation(internal.handoff.requestHandoff, {
    callId: callId as any,
    reason,
  });
  return jsonResponse({ ok: true, callId, result: res });
}
http.route({ path: '/twilio-request-handoff', method: 'POST', handler: httpAction(requestHandoffHandler) });
http.route({ path: '/twilio-request-handoff', method: 'GET', handler: httpAction(requestHandoffHandler) });

// ---- Conference status callback ----
// Twilio posts `conference-end` here when the handoff conference is over. This
// is the true end signal for the human-agent conversation after the AI has been
// dropped from the payer leg.
async function conferenceStatusHandler(ctx: any, request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const form = new URLSearchParams(await request.text());
    const callId = url.searchParams.get('callId') || form.get('callId') || '';
    const event = form.get('StatusCallbackEvent') || '';
    const conferenceSid = form.get('ConferenceSid') || '';

    if (!callId) {
      return jsonResponse({ success: false, error: 'missing_call_id' });
    }

    console.log(
      `[twilio-conference-status] callId=${callId} event=${event || 'unknown'} conference=${conferenceSid || 'unknown'}`
    );

    if (event === 'conference-end') {
      await closeHandoffCall(ctx, callId);
    }

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('Twilio conference status callback error:', error.message);
    return jsonResponse({ error: error.message });
  }
}

http.route({ path: '/twilio-conference-status', method: 'POST', handler: httpAction(conferenceStatusHandler) });
http.route({ path: '/twilio-conference-status', method: 'GET', handler: httpAction(conferenceStatusHandler) });

// ---- Conference recording status callback ----
// Twilio calls this once the conference recording is ready. We store the URL on
// the call, then ask Twilio to transcribe that recording (transcription result
// posts to /twilio-transcription). callId is threaded via the query string.
http.route({
  path: '/twilio-recording-status',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get('callId') || '';
      const form = new URLSearchParams(await request.text());
      const recordingUrl = form.get('RecordingUrl') || '';
      const recordingSid = form.get('RecordingSid') || '';
      const duration = parseInt(form.get('RecordingDuration') || '0', 10);

      if (callId && recordingUrl) {
        await ctx.runMutation(internal.handoff.saveRecording, {
          callId: callId as any,
          // Twilio's RecordingUrl has no extension; .mp3 is playable in browsers.
          recordingUrl: `${recordingUrl}.mp3`,
          duration: Number.isFinite(duration) ? duration : undefined,
        });

        // Request transcription of the recording (easiest path — Twilio does it
        // and posts the text to /twilio-transcription). Best-effort; recording
        // is already saved regardless.
        const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
        const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
        const SITE = process.env.CONVEX_SITE_URL;
        if (ACCOUNT_SID && AUTH_TOKEN && recordingSid) {
          try {
            await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${recordingSid}/Transcriptions.json`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  TranscribeCallback: `${SITE}/twilio-transcription?callId=${callId}`,
                }),
              }
            );
          } catch (e: any) {
            console.error('[recording-status] transcription request failed (non-fatal):', e.message);
          }
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('[recording-status] error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

// Browser playback proxy for Twilio recordings. Twilio media URLs require Basic
// Auth, so the UI points here and Convex fetches the MP3 with server-side creds.
http.route({
  path: '/twilio-recording-media',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get('callId') || '';
      if (!callId) return new Response('Missing callId', { status: 400 });

      const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
      const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
      if (!ACCOUNT_SID || !AUTH_TOKEN) return new Response('Twilio auth not configured', { status: 503 });

      const recording = await ctx.runQuery(internal.handoff.getRecordingForPlayback, { callId: callId as any });
      if (!recording?.recordingUrl) return new Response('Recording not found', { status: 404 });

      const recordingUrl = new URL(recording.recordingUrl);
      if (recordingUrl.protocol !== 'https:' || !recordingUrl.hostname.endsWith('twilio.com')) {
        return new Response('Invalid recording URL', { status: 400 });
      }

      const requestHeaders: Record<string, string> = {
        Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
      };
      const range = request.headers.get('range');
      if (range) requestHeaders.Range = range;

      const twilioRes = await fetch(recordingUrl.toString(), {
        headers: requestHeaders,
      });
      if (!twilioRes.ok) return new Response('Recording fetch failed', { status: twilioRes.status });

      const responseHeaders: Record<string, string> = {
        'Content-Type': twilioRes.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'private, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': twilioRes.headers.get('accept-ranges') || 'bytes',
      };
      const contentLength = twilioRes.headers.get('content-length');
      const contentRange = twilioRes.headers.get('content-range');
      if (contentLength) responseHeaders['Content-Length'] = contentLength;
      if (contentRange) responseHeaders['Content-Range'] = contentRange;

      return new Response(twilioRes.body, {
        status: twilioRes.status === 206 ? 206 : 200,
        headers: responseHeaders,
      });
    } catch (error: any) {
      console.error('[recording-media] error:', error.message);
      return new Response('Recording playback failed', { status: 500 });
    }
  }),
});
// ---- Transcription callback ----
// Twilio posts the recording transcription here (TranscriptionText).
http.route({
  path: '/twilio-transcription',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get('callId') || '';
      const form = new URLSearchParams(await request.text());
      const text = form.get('TranscriptionText') || '';
      const status = form.get('TranscriptionStatus') || '';
      if (callId && text && status === 'completed') {
        await ctx.runMutation(internal.handoff.saveHumanTranscript, {
          callId: callId as any,
          transcript: text,
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('[transcription] error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
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
          await closeHandoffCall(
            ctx,
            call._id,
            duration ? parseInt(duration, 10) : undefined
          );
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
    // handoff=1 → the AI media stream closed because Cadence redirected the
    // payer leg into the conference to drop the AI (Option-1 handoff in
    // progress). This is NOT the end of the call — the payer↔human conversation
    // continues in the conference. Do NOT run the end-of-call flow (that would
    // mark it completed and place the legacy follow-up call).
    const isHandoff = url.searchParams.get('handoff') === '1';

    if (!callId) {
      return new Response(JSON.stringify({ error: 'Missing callId' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (isHandoff) {
      console.log(`[call-ended] AI stream closed for HANDOFF on ${callId} — not ending the call.`);
      return new Response(JSON.stringify({ success: true, handoff: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const call = await ctx.runQuery(api.calls.getById, { id: callId as any });
      if (call && (call.status === 'in_progress' || call.status === 'initiating')) {
        console.log(`[call-ended] Running end-of-call flow for ${callId} (was ${call.status})`);
        // Run the full end-of-call flow, not just a status flip: endCall fetches
        // the transcript, computes handoffDetected, and runs analyzeTranscript —
        // which places the human-handoff follow-up call. A bare status update
        // here would flip the call to "completed" and make the frontend poll skip
        // analysis, so a natural hang-up would never trigger the follow-up.
        await ctx.runAction(api.callActions.endCall, { callId: callId as any });
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
      // Full parity with the native-outbound dialer: the bridge forwards these
      // to ElevenLabs as conversation_initiation_client_data, so the agent gets
      // the IVR playbook, voice-IVR phrases, and handoff vars — everything it
      // needs to navigate the IVR identically over the bridge transport.
      const dynamic_variables = buildMedicalDynamicVars({
        claim,
        patient,
        insurance,
        provider,
        callId: call._id,
        claimId: claim._id,
        handoffToken: call.handoffToken,
      });
      return new Response(JSON.stringify({
        callId: call._id,
        claimId: claim._id,
        dynamic_variables,
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
      // Session calls set session_id
      const sessionId = dynamicVars.session_id;

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
            handoffDetected: extractHandoffDetected(Array.isArray(transcriptArr) ? transcriptArr : []),
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

      // Trigger multi-patient session analysis if this was a session call
      if (sessionId && transcript) {
        try {
          await ctx.runAction(api.callSessions.analyzeSessionTranscript, {
            sessionId,
            callId,
            transcript,
            userId,
          });
        } catch (analysisError: any) {
          console.error('Session transcript analysis failed:', analysisError.message);
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
            For eligibility and benefits verification, press 2 or say eligibility.
            For member services, press 3 or say member services.
            For provider relations, press 4 or say provider.
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

    // Route to eligibility or claims based on what was said / pressed
    const isEligibility = digits === '2' ||
      speech.includes('eligib') || speech.includes('benefit') || speech.includes('verif') || speech.includes('dental');

    if (isEligibility) {
      return twimlResponse(`
        <Response>
          <Gather input="speech dtmf" numDigits="1" timeout="15" speechTimeout="3" action="${siteUrl}/test-ivr-dental-hold${fwdParam}" method="POST">
            <Say voice="Polly.Joanna">You have reached the eligibility and benefits department.
              For dental eligibility verification, press 1 or say dental.
              For medical eligibility, press 2 or say medical.
              To speak with an eligibility specialist, press 0.</Say>
          </Gather>
          <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
          <Hangup/>
        </Response>
      `);
    }

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

// ---------------------------------------------------------------------------
// Dental EV hold — routes to simulated eligibility specialist
// ---------------------------------------------------------------------------
http.route({
  path: '/test-ivr-dental-hold',
  method: 'POST',
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const siteUrl = url.origin;

    return twimlResponse(`
      <Response>
        <Say voice="Polly.Joanna">Please hold while we connect you to the next available dental eligibility specialist.
          Your estimated wait time is approximately one minute.</Say>
        <Pause length="3"/>
        <Say voice="Polly.Joanna">Thank you for your patience.</Say>
        <Pause length="2"/>
        <Gather input="speech" timeout="180" speechTimeout="auto" action="${siteUrl}/test-ivr-dental-agent" method="POST">
          <Say voice="Polly.Amy">Hi, thank you for holding. This is Sarah with the Acme Health Insurance dental eligibility department. How can I assist you today?</Say>
          <Pause length="120"/>
        </Gather>
        <Say voice="Polly.Amy">Thank you for calling. Goodbye.</Say>
        <Hangup/>
      </Response>
    `);
  }),
});

// ---------------------------------------------------------------------------
// Dental EV agent — simulated eligibility specialist providing benefit data
// ---------------------------------------------------------------------------
http.route({
  path: '/test-ivr-dental-agent',
  method: 'POST',
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const siteUrl = url.origin;
    const body = await request.text();
    const params = new URLSearchParams(body);
    const speech = (params.get('SpeechResult') || '').toLowerCase();

    // AI says goodbye or thanks
    if (speech.includes('thank') || speech.includes('bye') || speech.includes('that') ||
        speech.includes('no') || speech.includes('good') || speech.includes('great')) {
      return twimlResponse(`
        <Response>
          <Say voice="Polly.Amy">You are very welcome. Thank you for calling Acme Health Insurance dental eligibility.
            Have a wonderful day. Goodbye!</Say>
          <Hangup/>
        </Response>
      `);
    }

    // AI provides patient info and CDT codes — respond with full benefit data
    if (speech.includes('patient') || speech.includes('member') || speech.includes('smith') ||
        speech.includes('d01') || speech.includes('d11') || speech.includes('cdt') ||
        speech.includes('verify') || speech.includes('eligib') || speech.includes('benefit') ||
        speech.includes('hospital') || speech.includes('calling')) {
      return twimlResponse(`
        <Response>
          <Gather input="speech" timeout="60" speechTimeout="auto" action="${siteUrl}/test-ivr-dental-agent" method="POST">
            <Say voice="Polly.Amy">Thank you, let me pull up those benefits. One moment please.</Say>
            <Pause length="3"/>
            <Say voice="Polly.Amy">Alright, I have the information.
              For member John Smith, date of birth March 15, 1985, member ID W-1-2-3-4-5-6-7-8-9,
              dental coverage is currently active under their PPO plan, effective January 1st, 2026.

              For deductibles: the annual deductible is $1,500, and $50 has been met so far this year.

              The annual maximum benefit is $2,000, with $1,850 remaining for the year.

              In-network coinsurance is 80 percent, meaning the plan covers 80 percent of the allowed amount.
              Out-of-network coinsurance is 50 percent.
              There is no copay for preventive services.

              Network status: City General Hospital is in-network with Acme Health Insurance.

              For procedure D-0-1-5-0, comprehensive oral evaluation, this is a preventive service covered at 100 percent in-network.
              Frequency limit is once per calendar year. There is no record of this procedure in 2026, so the patient is eligible.

              For procedure D-1-1-1-0, adult prophylaxis, this is covered twice per calendar year.
              The patient has not had this procedure in 2026 and is eligible.

              No waiting periods apply to this member.

              Your verification reference number is E-V dash 2-0-2-6 dash 0-4-2-1 dash 8-8-3-4.

              Is there anything else you need for this verification?</Say>
            <Pause length="60"/>
          </Gather>
        </Response>
      `);
    }

    // Default — ask for patient info
    return twimlResponse(`
      <Response>
        <Gather input="speech" timeout="60" speechTimeout="auto" action="${siteUrl}/test-ivr-dental-agent" method="POST">
          <Say voice="Polly.Amy">Of course, I can verify dental eligibility for you.
            Could you please provide the patient name, date of birth, member ID,
            and the procedure codes you would like to verify?</Say>
          <Pause length="60"/>
        </Gather>
      </Response>
    `);
  }),
});

// ===========================================================================
// SESSION TOOLS — called by ElevenLabs client tools mid-call
// next_patient: returns next patient's data so AI can continue without hanging up
// refuse_patient: marks remaining patients as refused when rep won't do more
// ===========================================================================

http.route({
  path: '/session-tool/next-patient',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      console.log('[next-patient] raw body:', JSON.stringify(body));

      const sessionId = body?.agent_dynamic_variables?.session_id ||
        body?.dynamic_variables?.session_id || body?.session_id;

      console.log('[next-patient] extracted session_id:', sessionId);

      if (!sessionId) {
        console.error('[next-patient] missing session_id — tool call body had keys:', Object.keys(body || {}));
        return new Response(JSON.stringify({ error: 'Missing session_id' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const currentIndexStr = await ctx.runQuery(api.calls.getCallSetting, {
        key: `session:${sessionId}:currentIndex`,
      });
      const currentIndex = parseInt(currentIndexStr || '0', 10);
      const nextIndex = currentIndex + 1;

      const itemsJson = await ctx.runQuery(api.calls.getCallSetting, {
        key: `session:${sessionId}:items`,
      });
      if (!itemsJson) {
        console.error(`[next-patient] session:${sessionId}:items not found in callSettings`);
        return new Response(JSON.stringify({ error: 'Session items not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }

      const items = JSON.parse(itemsJson);
      console.log(`[next-patient] session=${sessionId} currentIndex=${currentIndex} nextIndex=${nextIndex} totalItems=${items.length}`);

      if (nextIndex >= items.length) {
        console.log(`[next-patient] session=${sessionId} all ${items.length} patients done`);
        return new Response(JSON.stringify({
          status: 'all_patients_done',
          message: 'All patients in this session have been processed.',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      await ctx.runMutation(api.calls.setCallSetting, {
        key: `session:${sessionId}:currentIndex`,
        value: String(nextIndex),
      });

      const next = items[nextIndex];
      console.log(`[next-patient] session=${sessionId} advancing to patient ${nextIndex}: ${next.patientName}`);

      return new Response(JSON.stringify({
        patient_name: next.patientName,
        patient_dob: next.patientDob,
        member_id: next.memberId,
        group_number: next.groupNumber || 'N/A',
        claim_number: next.claimNumber || 'N/A',
        date_of_service: next.dateOfService,
        billed_amount: next.billedAmount || 'N/A',
        cpt_codes: next.cptCodes || 'N/A',
        cdt_codes: next.cdtCodes || 'N/A',
        patient_index: nextIndex + 1,
        patients_remaining: items.length - nextIndex - 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err: any) {
      console.error('[next-patient] unexpected error:', err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

http.route({
  path: '/session-tool/refuse-patient',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const sessionId = body?.agent_dynamic_variables?.session_id ||
        body?.dynamic_variables?.session_id || body?.session_id;
      const itemIndex = body?.item_index ?? body?.parameters?.item_index;
      const reason = body?.reason || body?.parameters?.reason || 'refused_by_rep';

      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'Missing session_id' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // Log the refusal — store in callSettings for now
      const refusalsKey = `session:${sessionId}:refusals`;
      const existing = await ctx.runQuery(api.calls.getCallSetting, { key: refusalsKey });
      const refusals = existing ? JSON.parse(existing) : [];
      refusals.push({ itemIndex, reason, at: new Date().toISOString() });
      await ctx.runMutation(api.calls.setCallSetting, {
        key: refusalsKey,
        value: JSON.stringify(refusals),
      });

      console.log(`[session-tool] Session ${sessionId} item ${itemIndex} refused: ${reason}`);

      return new Response(JSON.stringify({ recorded: true, reason }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
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

// ===========================================================================
// /twilio-voice-token — mint a Twilio Voice access token for the browser
// softphone (Twilio Voice JS SDK). The token is a JWT signed HS256 with the
// Twilio API Key SECRET, granting the browser a VoiceGrant tied to our TwiML
// App. Built with Web Crypto (Convex runtime) — no Twilio Node SDK needed.
//
// Requires (Convex env): TWILIO_ACCOUNT_SID, TWILIO_API_KEY (SK...),
// TWILIO_API_SECRET, TWILIO_TWIML_APP_SID (AP...). Until those exist the
// endpoint returns 503 and the softphone stays inert — nothing else breaks.
// ===========================================================================

function base64UrlEncode(input: string | Uint8Array): string {
  let str: string;
  if (typeof input === 'string') {
    str = btoa(unescape(encodeURIComponent(input)));
  } else {
    let binary = '';
    for (let i = 0; i < input.length; i++) binary += String.fromCharCode(input[i]);
    str = btoa(binary);
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signTwilioAccessToken(opts: {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
  identity: string;
  ttlSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? 3600;
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${opts.apiKey}-${now}`,
    iss: opts.apiKey,
    sub: opts.accountSid,
    iat: now,
    exp: now + ttl,
    grants: {
      identity: opts.identity,
      voice: {
        outgoing: { application_sid: opts.twimlAppSid },
        incoming: { allow: true },
      },
    },
  };

  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(opts.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const encSig = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${encSig}`;
}

async function voiceTokenHandler(ctx: any, request: Request): Promise<Response> {
  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const API_KEY = process.env.TWILIO_API_KEY;
  const API_SECRET = process.env.TWILIO_API_SECRET;
  const TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;

  if (!ACCOUNT_SID || !API_KEY || !API_SECRET || !TWIML_APP_SID) {
    return jsonResponse(
      {
        error: {
          code: 'softphone_not_configured',
          message:
            'Browser softphone not configured. Set TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID in Convex env.',
        },
      },
      503
    );
  }

  const url = new URL(request.url);
  const identity =
    url.searchParams.get('identity') || `agent-${Math.random().toString(36).slice(2, 10)}`;

  const token = await signTwilioAccessToken({
    accountSid: ACCOUNT_SID,
    apiKey: API_KEY,
    apiSecret: API_SECRET,
    twimlAppSid: TWIML_APP_SID,
    identity,
  });

  return jsonResponse({ token, identity });
}

http.route({ path: '/twilio-voice-token', method: 'GET', handler: httpAction(voiceTokenHandler) });
http.route({ path: '/twilio-voice-token', method: 'POST', handler: httpAction(voiceTokenHandler) });

// CORS preflight for the voice-token endpoint (browser fetches it cross-origin).
http.route({
  path: '/twilio-voice-token',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }),
});

export default http;
