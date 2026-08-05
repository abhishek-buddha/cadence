from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "call-handling-svc"


settings = Settings()
