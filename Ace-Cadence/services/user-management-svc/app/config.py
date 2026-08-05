from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "user-management-svc"


settings = Settings()
