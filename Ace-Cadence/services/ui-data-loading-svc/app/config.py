from common.config import CommonSettings


class Settings(CommonSettings):
    """Base URLs for the services this one aggregates across — nginx-internal
    Docker Compose service names, not the public /api/* paths (see
    docker-compose.yml)."""

    service_name: str = "ui-data-loading-svc"

    master_data_svc_url: str = "http://master-data-svc:8003"
    user_management_svc_url: str = "http://user-management-svc:8002"
    call_handling_svc_url: str = "http://call-handling-svc:8004"


settings = Settings()
