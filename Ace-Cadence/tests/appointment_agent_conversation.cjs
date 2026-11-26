// Real ElevenLabs text conversation + real isolated API. Key is read only from stdin.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const callId = Number(process.argv[2]);
const appointmentId = Number(process.argv[3]);
const api = 'http://127.0.0.1:18080';
const auth = { Authorization: 'Bearer review-session' };

(async () => {
  assert(Number.isSafeInteger(callId) && Number.isSafeInteger(appointmentId));
  const key = fs.readFileSync(0, 'utf8').trim();
  const signed = await fetch('https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=agent_1101m8bhz3gnf7sbsdwdd2wh9cdy', { headers: { 'xi-api-key': key } });
  assert(signed.ok, 'Signed URL unavailable');
  const { signed_url } = await signed.json();
  const ws = new WebSocket(signed_url);
  const transcript = [];
  const seen = [];
  let step = 0;
  let patientTurn = 0;
  const record = async () => (await fetch(`${api}/api/appointments/${appointmentId}`, { headers: auth })).json();
  assert.equal((await record()).appointment_type, 'Agent booking review', 'Use only the synthetic review fixture');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('Agent timed out at step '+step)); }, 120000);
      function send(text) { patientTurn++; transcript.push('Patient: '+text); ws.send(JSON.stringify({ type: 'user_message', text })); }
      ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'conversation_initiation_client_data', conversation_config_override: { conversation: { text_only: true } }, dynamic_variables: { patient_name: 'Review Patient', practice_name: 'Review Clinic' } })));
      ws.addEventListener('error', reject);
      ws.addEventListener('message', async event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event.event_id }));
          if (msg.type === 'agent_response') {
            const text = msg.agent_response_event.agent_response;
            transcript.push('Agent: '+text);
            console.log('Agent:', text);
            if (step === 0) { step = 1; send('Yes, I am Review Patient. My date of birth is February third, nineteen eighty.'); }
            else if (step === 2) { step = 3; send('Please reschedule to February twentieth, twenty twenty-seven, at three forty-five PM in the clinic timezone.'); }
            else if ([3,4].includes(step) && /\?/.test(text)) { assert(/confirm|correct|right|agree|shall|would|does/i.test(text), 'Agent must ask for slot confirmation'); step = 4; send('Yes, I confirm February twentieth, twenty twenty-seven, at three forty-five PM Eastern time. Please change it.'); }
            else if (step === 5 && /rescheduled|changed|updated/i.test(text)) { step = 6; send('I want to cancel my appointment.'); }
            else if (step === 6 && /\?/.test(text)) { assert(/confirm|sure|cancel|correct/i.test(text)); step = 7; send('No, do not cancel. Keep my rescheduled appointment.'); }
            else if (step === 7 && /keep|remain|unchanged|rescheduled/i.test(text)) { assert.equal((await record()).status, 'rescheduled'); step = 8; send('I have changed my mind. I would like to cancel that appointment now.'); }
            else if ([8,9].includes(step) && /\?/.test(text)) { step = 9; send('Yes, I confirm cancellation of that appointment. Please cancel it.'); }
            else if (step === 10 && /cancel/i.test(text)) { clearTimeout(timer); ws.close(); resolve(); }
          }
          if (msg.type === 'client_tool_call') {
            const tool = msg.client_tool_call;
            console.log('Tool:', tool.tool_name);
            assert(['verify_patient', 'reschedule_appointment', 'cancel_appointment'].includes(tool.tool_name), 'Booking requests must not trigger an operator');
            if (tool.tool_name === 'reschedule_appointment') {
              assert.equal(tool.parameters.scheduled_at, '2027-02-20T15:45');
            }
            const response = await fetch(`${api}/appointment-voice/tool`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer review-bridge-secret' }, body: JSON.stringify({ callId, token: 'review-voice-token', name: tool.tool_name, arguments: tool.parameters, patient_turn: patientTurn }) });
            assert(response.ok, await response.clone().text());
            const result = await response.json();
            if (tool.tool_name === 'verify_patient') { assert(result.verified); seen.push(tool.tool_name); step = 2; }
            if (result.status === 'rescheduled') { assert.equal(step, 4, 'No save before spoken confirmation'); assert.equal(tool.parameters.confirmed, true); assert.equal((await record()).status, 'rescheduled'); seen.push(tool.tool_name); step = 5; }
            if (result.status === 'cancelled') { assert.equal(step, 9, 'No cancellation after the patient declines'); assert.equal(tool.parameters.confirmed, true); assert.equal((await record()).status, 'cancelled'); seen.push(tool.tool_name); step = 10; }
            ws.send(JSON.stringify({ type: 'client_tool_result', tool_call_id: tool.tool_call_id, result: JSON.stringify(result), is_error: false }));
          }
        } catch (error) { clearTimeout(timer); ws.close(); reject(error); }
      });
    });
    assert.deepEqual(seen, ['verify_patient', 'reschedule_appointment', 'cancel_appointment']);
    console.log('PASS: real agent confirms and saves rescheduling, respects declined cancellation, then cancels after explicit agreement without an operator.');
  } finally {
    ws.close();
    await fetch(`${api}/appointment-voice/artifacts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer review-bridge-secret' }, body: JSON.stringify({ callId, token: 'review-voice-token', transcript: transcript.join('\n') }) });
    const route = `/appointment-voice/status?callId=${callId}&token=review-voice-token`;
    const fields = { CallSid: 'CA'+String(callId).padStart(32, '0'), CallStatus: 'completed' };
    const signature = crypto.createHmac('sha1', 'review-signature-token').update(api+route+Object.keys(fields).sort().map(k => k+fields[k]).join('')).digest('base64');
    const ended = await fetch(api+route, { method: 'POST', headers: { 'X-Twilio-Signature': signature }, body: new URLSearchParams(fields) });
    assert(ended.ok, 'Synthetic call cleanup failed');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
