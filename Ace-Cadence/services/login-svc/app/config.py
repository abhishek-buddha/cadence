from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "login-svc"

    # Matches the current app's CADENCE_ACCESS_CODE env var / default PIN.
    access_code: str = "472394"

    # How long an issued session stays valid.
    session_ttl_hours: int = 12


settings = Settings()
