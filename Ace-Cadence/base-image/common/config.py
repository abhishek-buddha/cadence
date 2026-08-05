"""Shared settings base class every service extends.

Holds the environment variables common to all services (DB connection,
Redis). Each service defines its own `Settings(CommonSettings)` subclass in
its own app/config.py, adding whatever service-specific fields it needs
(e.g. TWILIO_ACCOUNT_SID in telephony-bridge-svc, OPENAI_API_KEY in
call-handling-svc).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class CommonSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # MySQL is installed natively on the EC2 host, not containerized (see
    # architecture plan, Foundational Decision 8) — every service reaches it
    # via the host's Docker-bridge address, not `localhost`.
    database_url: str = "mysql+asyncmy://cadence:changeme@host.docker.internal:3306/cadence"

    # Redis: db 0 for Celery broker/backend, db 1 for pub/sub fan-out — kept
    # on separate DB indexes so debugging one doesn't disturb the other.
    redis_url: str = "redis://redis:6379/0"
    redis_pubsub_url: str = "redis://redis:6379/1"

    # Set per-service via docker-compose so logs/traces self-identify.
    service_name: str = "unknown-service"

    log_level: str = "INFO"
