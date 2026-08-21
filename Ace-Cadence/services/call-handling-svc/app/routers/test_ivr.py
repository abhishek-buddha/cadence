"""Payer IVR simulator — the fake "Acme Health Insurance" phone system.

Test infrastructure, not product code: a Twilio number's Voice URL points here
and this answers as a payer's automated menu, so calls can be exercised end to
end without dialing a real insurer.

Ported from Render's `/test-ivr*` routes in convex/http.ts. That copy lives on
Convex (`rapid-pheasant-510.convex.site`), which is being retired — and it was
the last thing in AWS's call path still depending on Convex. Point a Twilio
number's Voice URL at `https://cadence-pro.acelive.ai/test-ivr` and the whole
flow runs on AWS.

The important behavior: after the hold music this <Dial>s the payer's
human-agent number, so the "human rep" joins the SAME leg the AI is already on.
That is what makes "IVR -> IVR, then Human <-> Human" work — the bridge detects
the human, the operator is offered the call, and the AI drops on takeover. The
number comes from the `forwardNumber` call-setting, which
`calls.initiate_call` writes from the payer's `human_agent_number` right before
dialing. With no number configured it falls through to a TTS rep instead, which
is the same fallback Render has.
"""

import urllib.parse
from html import escape

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict

router = APIRouter(tags=["test-ivr"])

_HOLD_AUDIO = "https://cadence-pro.acelive.ai/audio/hold-15s.mp3"


def _twiml(body: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?>\n<Response>{body}</Response>',
                    media_type="application/xml")


async def _form(request: Request) -> dict[str, str]:
    raw = (await request.body()).decode(errors="ignore")
    parsed = urllib.parse.parse_qs(raw)
    return {k: v[-1] for k, v in parsed.items() if v}


async def _setting(db: AsyncSession, key: str) -> str:
    result = await db.execute(text("SELECT value FROM call_settings WHERE `key` = :key"), {"key": key})
    row = row_to_dict(result.first())
    return (row or {}).get("value") or ""


async def _forward_number(request: Request, db: AsyncSession, form: dict) -> str:
    """Resolve which number the simulated IVR should transfer to.

    Prefers the per-call key so two concurrent calls to different payers can't
    read each other's number — the global key is a single row and Render's
    version races on it. Falls back to the global key, then the URL param that
    carries the value between IVR steps.
    """
    call_id = request.query_params.get("callId") or form.get("callId") or ""
    if call_id:
        per_call = await _setting(db, f"forwardNumber:{call_id}")
        if per_call:
            return per_call
    return (await _setting(db, "forwardNumber")) or request.query_params.get("forwardNumber") or ""


def _chain(path: str, forward_number: str, call_id: str) -> str:
    """Carry state to the next IVR step. Twilio fetches these URLs itself, so
    anything the next step needs has to ride in the query string."""
    params = {}
    if forward_number:
        params["forwardNumber"] = forward_number
    if call_id:
        params["callId"] = call_id
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    return escape(f"https://cadence-pro.acelive.ai{path}{query}")


@router.api_route("/test-ivr", methods=["GET", "POST"])
async def test_ivr(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    form = await _form(request)
    fwd = await _forward_number(request, db, form)
    call_id = request.query_params.get("callId") or form.get("callId") or ""
    action = _chain("/test-ivr-level2", fwd, call_id)
    return _twiml(f"""
  <Gather input="speech dtmf" numDigits="1" timeout="15" speechTimeout="3" action="{action}" method="POST">
    <Say voice="Polly.Joanna">Thank you for calling Acme Health Insurance, a preferred provider organization.
      Please listen carefully as our menu options have recently changed.
      For claims and billing, press 1 or say claims.
      For eligibility and benefits verification, press 2 or say eligibility.
      For member services, press 3 or say member services.
      For provider relations, press 4 or say provider.
      To repeat this menu, press 9.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
  <Hangup/>""")


@router.api_route("/test-ivr-level2", methods=["GET", "POST"])
async def test_ivr_level2(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    form = await _form(request)
    fwd = await _forward_number(request, db, form)
    call_id = request.query_params.get("callId") or form.get("callId") or ""
    digits = form.get("Digits") or ""
    speech = (form.get("SpeechResult") or "").lower()

    is_eligibility = digits == "2" or any(
        w in speech for w in ("eligib", "benefit", "verif", "dental")
    )
    if is_eligibility:
        action = _chain("/test-ivr-dental-hold", fwd, call_id)
        return _twiml(f"""
  <Gather input="speech dtmf" numDigits="1" timeout="15" speechTimeout="3" action="{action}" method="POST">
    <Say voice="Polly.Joanna">You have reached the eligibility and benefits department.
      For dental eligibility verification, press 1 or say dental.
      For medical eligibility, press 2 or say medical.
      To speak with an eligibility specialist, press 0.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
  <Hangup/>""")

    if digits or speech:
        action = _chain("/test-ivr-hold", fwd, call_id)
        return _twiml(f"""
  <Gather input="speech dtmf" numDigits="1" timeout="15" speechTimeout="3" action="{action}" method="POST">
    <Say voice="Polly.Joanna">You have reached the claims department.
      For claim status inquiry, press 1 or say claim status.
      To file a new claim, press 2.
      For claim appeals, press 3.
      To speak with a claims representative, press 0.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
  <Hangup/>""")

    return _twiml("""
  <Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>
  <Hangup/>""")


@router.api_route("/test-ivr-hold", methods=["GET", "POST"])
async def test_ivr_hold(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    """Hold, then hand to a human — the step that matters.

    With a forward number configured the call is <Dial>ed to it, putting the
    real human on this same leg. Without one, a TTS rep answers instead so the
    flow is still exercisable with no second phone involved.
    """
    form = await _form(request)
    fwd = await _forward_number(request, db, form)
    call_id = request.query_params.get("callId") or form.get("callId") or ""

    if fwd:
        after_hold = f"""
  <Say voice="Polly.Joanna">Transferring you now.</Say>
  <Dial timeout="30">{escape(fwd)}</Dial>
  <Hangup/>"""
    else:
        action = _chain("/test-ivr-agent", fwd, call_id)
        after_hold = f"""
  <Gather input="speech" timeout="180" speechTimeout="auto" action="{action}" method="POST">
    <Say voice="Polly.Matthew">Hi there, thanks so much for holding. This is Michael with the Acme Health Insurance claims department. How can I help you today?</Say>
    <Pause length="180"/>
  </Gather>
  <Say voice="Polly.Matthew">Thank you for calling. Goodbye.</Say>
  <Hangup/>"""

    return _twiml(f"""
  <Say voice="Polly.Joanna">Please hold while we transfer you to the next available claims representative.
    Your estimated wait time is approximately 15 seconds. Your call is important to us.</Say>
  <Play>{escape(_HOLD_AUDIO)}</Play>
  <Pause length="3"/>{after_hold}""")


@router.api_route("/test-ivr-agent", methods=["GET", "POST"])
async def test_ivr_agent(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    """TTS claims rep, used when no forward number is configured."""
    form = await _form(request)
    speech = (form.get("SpeechResult") or "").lower()
    call_id = request.query_params.get("callId") or form.get("callId") or ""
    action = _chain("/test-ivr-agent", "", call_id)

    if any(w in speech for w in ("no", "thank", "bye", "great", "good")):
        return _twiml("""
  <Say voice="Polly.Matthew">Glad I could help! Thanks for calling Acme Health Insurance. Have a wonderful day. Goodbye!</Say>
  <Hangup/>""")

    if any(c.isdigit() for c in speech) or "number" in speech or "clm" in speech:
        return _twiml(f"""
  <Gather input="speech" timeout="60" speechTimeout="auto" action="{action}" method="POST">
    <Say voice="Polly.Matthew">Okay, let me look that up. One moment please.</Say>
    <Pause length="3"/>
    <Say voice="Polly.Matthew">Alright, I found that claim. It looks like it is currently in processing status.
      The claim was received on March 15th and the expected decision date is approximately 10 business days from now.
      The reference number for this call is R E F dash 2 0 2 6 0 4 0 5 dash 5 6 7 8.
      Is there anything else I can help you with today?</Say>
    <Pause length="60"/>
  </Gather>""")

    return _twiml(f"""
  <Gather input="speech" timeout="60" speechTimeout="auto" action="{action}" method="POST">
    <Say voice="Polly.Matthew">Sure, I can help with that. Could you give me the claim number so I can look it up?</Say>
    <Pause length="60"/>
  </Gather>""")


@router.api_route("/test-ivr-dental-hold", methods=["GET", "POST"])
async def test_ivr_dental_hold(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    form = await _form(request)
    call_id = request.query_params.get("callId") or form.get("callId") or ""
    action = _chain("/test-ivr-dental-agent", "", call_id)
    return _twiml(f"""
  <Say voice="Polly.Joanna">Please hold while we connect you to the next available dental eligibility specialist.
    Your estimated wait time is approximately one minute.</Say>
  <Pause length="3"/>
  <Say voice="Polly.Joanna">Thank you for your patience.</Say>
  <Pause length="2"/>
  <Gather input="speech" timeout="180" speechTimeout="auto" action="{action}" method="POST">
    <Say voice="Polly.Amy">Hi, thank you for holding. This is Sarah with the Acme Health Insurance dental eligibility department. How can I assist you today?</Say>
    <Pause length="120"/>
  </Gather>
  <Say voice="Polly.Amy">Thank you for calling. Goodbye.</Say>
  <Hangup/>""")


@router.api_route("/test-ivr-dental-agent", methods=["GET", "POST"])
async def test_ivr_dental_agent(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    form = await _form(request)
    speech = (form.get("SpeechResult") or "").lower()
    call_id = request.query_params.get("callId") or form.get("callId") or ""
    action = _chain("/test-ivr-dental-agent", "", call_id)

    if any(w in speech for w in ("thank", "bye", "that", "no", "good", "great")):
        return _twiml("""
  <Say voice="Polly.Amy">You are very welcome. Thank you for calling Acme Health Insurance dental eligibility.
    Have a wonderful day. Goodbye!</Say>
  <Hangup/>""")

    if any(w in speech for w in ("patient", "member", "smith", "d01", "d11", "cdt",
                                "verify", "eligib", "benefit", "hospital", "calling")):
        return _twiml(f"""
  <Gather input="speech" timeout="60" speechTimeout="auto" action="{action}" method="POST">
    <Say voice="Polly.Amy">Thank you, let me pull up those benefits. One moment please.</Say>
    <Pause length="3"/>
    <Say voice="Polly.Amy">Alright, I have the information.
      For member John Smith, date of birth March 15, 1985, member ID W-1-2-3-4-5-6-7-8-9,
      dental coverage is currently active under their PPO plan, effective January 1st, 2026.
      The annual deductible is 1500 dollars, and 50 dollars has been met so far this year.
      The annual maximum is 2000 dollars with 1850 dollars remaining.
      The provider is in network, and coinsurance is 80 percent.
      Is there anything else I can help you with?</Say>
    <Pause length="60"/>
  </Gather>""")

    return _twiml(f"""
  <Gather input="speech" timeout="60" speechTimeout="auto" action="{action}" method="POST">
    <Say voice="Polly.Amy">Of course. Could you give me the member ID and the procedure codes you need verified?</Say>
    <Pause length="60"/>
  </Gather>""")
