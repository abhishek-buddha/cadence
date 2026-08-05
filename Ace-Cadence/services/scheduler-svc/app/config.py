from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "scheduler-svc"


settings = Settings()
