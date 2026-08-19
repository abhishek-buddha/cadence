from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "call-handling-svc"
    public_base_url: str = "http://localhost"
    bridge_server_url: str = "wss://cadence-bridge.onrender.com"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_api_key: str = ""
    twilio_api_secret: str = ""
    twilio_twiml_app_sid: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_agent_phone_number_id: str = ""
    # Shared secret for verifying ElevenLabs post-call webhooks. Already present
    # in the AWS env (ELEVENLABS_WEBHOOK_SECRET); nothing consumed it until the
    # /elevenlabs-webhook route was ported.
    elevenlabs_webhook_secret: str = ""


settings = Settings()
