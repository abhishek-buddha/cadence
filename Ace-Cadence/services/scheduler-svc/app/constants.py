VALID_JOB_TYPES = ["claim_followup", "session_start", "call_retry"]
VALID_JOB_STATUSES = ["pending", "triggered", "failed", "skipped"]


def validate_job_type(job_type: str) -> None:
    if job_type not in VALID_JOB_TYPES:
        raise ValueError(f"job_type must be one of {VALID_JOB_TYPES}")


def validate_job_status(status: str | None) -> None:
    if status is not None and status not in VALID_JOB_STATUSES:
        raise ValueError(f"status must be one of {VALID_JOB_STATUSES}")
