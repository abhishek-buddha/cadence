from common.config import CommonSettings


class Settings(CommonSettings):
    service_name: str = "reports-dashboards-svc"

    call_handling_svc_url: str = "http://call-handling-svc:8004"
    master_data_svc_url: str = "http://master-data-svc:8003"
    user_management_svc_url: str = "http://user-management-svc:8002"


settings = Settings()
