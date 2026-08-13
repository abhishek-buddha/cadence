from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "telephony-bridge-svc"

    call_handling_svc_url: str = "http://call-handling-svc:8004"
    elevenlabs_api_key: str = ""
    bridge_server_url: str = "wss://cadence-bridge.onrender.com"


settings = Settings()
