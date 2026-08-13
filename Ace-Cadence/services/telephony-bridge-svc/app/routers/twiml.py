from html import escape

from fastapi import APIRouter, Request, Response

from ..config import settings

router = APIRouter(tags=["twiml"])


@router.api_route("/twiml-call-start", methods=["GET", "POST"])
async def call_start(request: Request) -> Response:
    call_id = request.query_params.get("callId") or ""
    claim_id = request.query_params.get("claimId") or ""
    bridge_url = settings.bridge_server_url.rstrip("/")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="{escape(bridge_url)}/media-stream">
      <Parameter name="callId" value="{escape(call_id)}"/>
      <Parameter name="claimId" value="{escape(claim_id)}"/>
    </Stream>
  </Connect>
</Response>"""
    return Response(content=xml, media_type="application/xml")