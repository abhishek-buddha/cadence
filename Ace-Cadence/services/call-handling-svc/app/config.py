from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "call-handling-svc"
    public_base_url: str = "http://localhost"
    bridge_server_url: str = "wss://cadence-bridge.onrender.com"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_agent_phone_number_id: str = ""


settings = Settings()
