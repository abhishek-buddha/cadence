import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';

const http = httpRouter();

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
      console.error('Webhook processing error:', error);
      return new Response(JSON.stringify({ error: 'Processing failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

export default http;
