from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "master-data-svc"


settings = Settings()
