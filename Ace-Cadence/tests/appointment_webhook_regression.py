"""Run in the isolated review API: python /review-tests/appointment_webhook_regression.py.

Uses the running API, SQL and a real HTTP form receiver; never places a phone call.
"""
import asyncio
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlencode
from xml.etree import ElementTree

import httpx
from sqlalchemy import text
from common.db import engine
from app.config import settings
from app.routers.calls import _post_form


def check_outbound_form():
    class Receiver(BaseHTTPRequestHandler):
        def do_POST(self):
            self.server.body = self.rfile.read(int(self.headers['Content-Length']))
            self.server.authorization = self.headers.get('Authorization')
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"ok": true}')

        def log_message(self, *_):
            pass

    server = HTTPServer(('127.0.0.1', 0), Receiver)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f'http://127.0.0.1:{server.server_port}/Calls.json'
        # Existing claims and monitor-stream scalar fields retain their encoding.
        scalars = {'To': '+12025550110', 'Url': 'https://example.test/start?callId=1&token=x',
                   'StatusCallbackEvent': 'initiated ringing answered completed', 'Timeout': '60'}
        assert _post_form(url, scalars, 'Basic review') == {'ok': True}
        assert server.body == urlencode(scalars).encode()
        assert server.authorization == 'Basic review'
        events = ['initiated', 'ringing', 'answered', 'completed']
        _post_form(url, {**scalars, 'StatusCallbackEvent': events})
        decoded = parse_qs(server.body.decode())
        assert decoded['StatusCallbackEvent'] == events, decoded
        assert decoded['To'] == [scalars['To']]
        assert server.authorization is None
        print('PASS: repeated REST callback events; existing scalar requests unchanged')
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


async def main():
    assert engine.url.database == 'cadence_review', 'Only the disposable review DB is allowed'
    assert not settings.twilio_account_sid, 'Review environment must not dial phones'
    aid = cid = None
    try:
        async with engine.begin() as db:
            aid = (await db.execute(text("""INSERT INTO appointments
                (patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location)
                VALUES (1,1,'+12025550110','Webhook regression','2090-01-20 14:30','UTC','Review')"""))).lastrowid
            cid = (await db.execute(text("""INSERT INTO calls(use_case,status,started_at,handoff_token)
                VALUES ('appointment','initiating',UTC_TIMESTAMP(),'webhook-regression-token')"""))).lastrowid
            await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid': cid, 'aid': aid})
        async with httpx.AsyncClient(base_url='http://127.0.0.1:8004', timeout=15) as client:
            async def send(endpoint, form, *, signed=True, tampered=False, token='webhook-regression-token'):
                path = f'/appointment-voice/{endpoint}?callId={cid}&token={token}'
                payload = settings.public_base_url.rstrip('/') + path + ''.join(k + form[k] for k in sorted(form))
                signature = base64.b64encode(hmac.new(settings.twilio_auth_token.encode(), payload.encode(), hashlib.sha1).digest()).decode()
                data = {**form, 'CalledZip': 'changed'} if tampered else form
                return await client.post(path, data=data, headers={'X-Twilio-Signature': signature} if signed else {})

            # Twilio's failed real request included CalledZip= and ToZip=.
            form = {'CallSid': 'CA' + '0' * 32, 'CalledZip': '', 'ToZip': '', 'CallStatus': 'in-progress'}
            for endpoint in ('start', 'status', 'recording'):
                assert (await send(endpoint, form, signed=False)).status_code == 403
                assert (await send(endpoint, form, tampered=True)).status_code == 403
                rejected = await send(endpoint, form, token='wrong-token')
                assert rejected.status_code == 403
                assert rejected.json()['detail'] in ('Invalid call token', 'Invalid or ended call'), rejected.text
                response = await send(endpoint, form)
                expected = 422 if endpoint == 'recording' else 200
                assert response.status_code == expected, (endpoint, response.status_code, response.text)
                if endpoint == 'start':
                    stream = ElementTree.fromstring(response.text).find('Connect/Stream')
                    assert stream is not None and stream.attrib['url'].endswith('/appointment-media-stream')
                    assert {p.attrib['name']: p.attrib['value'] for p in stream} == {'callId': str(cid), 'token': 'webhook-regression-token'}
                if endpoint == 'recording':
                    assert response.json()['detail'] == 'Invalid recording ID', response.text
                print(f'PASS: {endpoint} accepts signed blanks and rejects unsigned/tampered/wrong-token requests')
            assert (await send('status', {**form, 'CallStatus': 'no-answer'})).status_code == 200
            async with engine.connect() as db:
                row = (await db.execute(text('SELECT status,completed_at,twilio_call_sid FROM calls WHERE id=:id'), {'id': cid})).mappings().one()
                assert row['status'] == 'no_answer' and row['completed_at'] and row['twilio_call_sid'] == form['CallSid']
            assert (await send('start', form)).status_code == 403, 'Ended calls must remain blocked'
            print('PASS: terminal callback persists No Answer and blocks restarting ended calls')
        check_outbound_form()
    finally:
        async with engine.begin() as db:
            await db.execute(text('DELETE FROM appointment_calls WHERE call_id=:id'), {'id': cid})
            await db.execute(text('DELETE FROM calls WHERE id=:id'), {'id': cid})
            await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id': aid})
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
