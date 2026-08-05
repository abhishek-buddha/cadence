-- Ace-Cadence database schema.
--
-- One shared MySQL database, logically partitioned by owning service (see
-- docs/ARCHITECTURE_PLAN_REWRITE.md, Foundational Decision 3). Column names
-- here are load-bearing: every service's routers (services/*/app/routers/*.py)
-- talk to these tables with raw SQL (sqlalchemy.text), not an ORM, so a typo
-- here breaks that service at request time, not at import time.
--
-- Cross-service references (e.g. claims.patient_id -> patients.id) are
-- intentionally NOT declared as FOREIGN KEYs — each service only owns and
-- migrates its own tables (see architecture plan §2 "read-only cross-service
-- exception"). FKs are only used within a single service's own tables.
--
-- Run this after creating the `cadence` database and user (see the EC2 setup
-- steps) and before starting `docker-compose up`.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- Shared (common/audit.py — written by every service, owned by none)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64),
    user_email VARCHAR(255),
    user_role VARCHAR(30),
    action VARCHAR(20) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(64),
    phi_accessed BOOLEAN,
    payload_summary VARCHAR(1000),
    ip_address VARCHAR(64),
    user_agent VARCHAR(500),
    `timestamp` DATETIME NOT NULL,
    INDEX idx_audit_user_id (user_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_resource_type (resource_type),
    INDEX idx_audit_timestamp (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- login-svc
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_token VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_role VARCHAR(30) NOT NULL,
    user_name VARCHAR(255),
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    UNIQUE KEY uq_sessions_token (session_token),
    INDEX idx_sessions_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- user-management-svc
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_groups (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    insurance_contact_ids JSON,
    provider_ids JSON,
    specializations JSON,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_user_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login_at VARCHAR(30),
    insurance_contact_ids JSON,
    provider_ids JSON,
    specializations JSON,
    team_lead_name VARCHAR(255),
    user_group_id BIGINT,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_users_email (email),
    INDEX idx_users_role (role),
    INDEX idx_users_user_group_id (user_group_id),
    CONSTRAINT fk_users_user_group FOREIGN KEY (user_group_id) REFERENCES user_groups (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- master-data-svc
-- ============================================================================

CREATE TABLE IF NOT EXISTS providers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    practice_name VARCHAR(255) NOT NULL,
    npi VARCHAR(20) NOT NULL,
    tax_id VARCHAR(20) NOT NULL,
    address VARCHAR(500) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    specialty VARCHAR(255),
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_providers_practice_name (practice_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS insurance_contacts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    department VARCHAR(255),
    payer_id VARCHAR(100),
    hours VARCHAR(255),
    notes TEXT,
    avg_hold_time FLOAT,
    payer_kind VARCHAR(20),
    call_connection_type VARCHAR(30),
    ivr_enabled BOOLEAN,
    ivr_instructions TEXT,
    ivr_sequence VARCHAR(255),
    ivr_steps JSON,
    voice_ivr_enabled BOOLEAN,
    voice_ivr_phrases JSON,
    ivr_source_transcript TEXT,
    ivr_verified_at DATETIME,
    verification_requirements TEXT,
    voice_tone VARCHAR(20),
    voice_modulation VARCHAR(50),
    human_agent_number VARCHAR(30),
    warm_transfer_number VARCHAR(30),
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_insurance_contacts_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patients (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    date_of_birth VARCHAR(10) NOT NULL,
    member_id VARCHAR(100) NOT NULL,
    group_number VARCHAR(100),
    policy_number VARCHAR(100),
    subscriber_name VARCHAR(255),
    relationship VARCHAR(50),
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_patients_member_id (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- call-handling-svc
-- ============================================================================

CREATE TABLE IF NOT EXISTS claims (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    use_case VARCHAR(20) NOT NULL,
    claim_number VARCHAR(100) NOT NULL,
    patient_id BIGINT NOT NULL,
    insurance_contact_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    date_of_service VARCHAR(10) NOT NULL,
    status VARCHAR(30) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    notes TEXT,
    amount FLOAT,
    date_submitted VARCHAR(10),
    cpt_codes JSON,
    diagnosis_codes JSON,
    aging_bucket VARCHAR(20),
    denial_code VARCHAR(50),
    denial_reason TEXT,
    remark_code VARCHAR(50),
    appeal_deadline VARCHAR(10),
    reference_number VARCHAR(100),
    cdt_codes JSON,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_claims_use_case (use_case),
    INDEX idx_claims_patient_id (patient_id),
    INDEX idx_claims_insurance_contact_id (insurance_contact_id),
    INDEX idx_claims_provider_id (provider_id),
    INDEX idx_claims_status (status),
    INDEX idx_claims_priority (priority),
    INDEX idx_claims_claim_number (claim_number),
    INDEX idx_claims_aging_bucket (aging_bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claim_followups (
    claim_id BIGINT PRIMARY KEY,
    last_called_at DATETIME,
    next_follow_up_date VARCHAR(10),
    follow_up_disposition VARCHAR(20),
    follow_up_comment TEXT,
    follow_up_by VARCHAR(255),
    follow_up_at DATETIME,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_claim_followups_next_follow_up_date (next_follow_up_date),
    CONSTRAINT fk_claim_followups_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS call_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    insurance_contact_id BIGINT NOT NULL,
    use_case VARCHAR(20) NOT NULL,
    item_refs JSON NOT NULL,
    status VARCHAR(20) NOT NULL,
    aggregate_outcome VARCHAR(30),
    notes TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_call_sessions_insurance_contact_id (insurance_contact_id),
    INDEX idx_call_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calls (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    claim_id BIGINT,
    insurance_contact_id BIGINT NOT NULL,
    session_id BIGINT,
    use_case VARCHAR(20),
    status VARCHAR(20) NOT NULL,
    eleven_labs_conversation_id VARCHAR(255),
    twilio_call_sid VARCHAR(255),
    duration FLOAT,
    transcript TEXT,
    recording_path VARCHAR(500),
    error_message TEXT,
    call_phase VARCHAR(50),
    hold_started_at DATETIME,
    hold_duration FLOAT,
    human_detected_at DATETIME,
    ivr_sequence_used VARCHAR(255),
    outcome VARCHAR(30),
    outcome_reason TEXT,
    required_fields_retrieved JSON,
    missing_fields JSON,
    transferred_at DATETIME,
    transfer_type VARCHAR(10),
    transfer_destination VARCHAR(30),
    parent_call_id BIGINT,
    attempt_number INT,
    handoff_follow_up_at DATETIME,
    handoff_state VARCHAR(20),
    handoff_requested_at DATETIME,
    handoff_reason VARCHAR(255),
    handoff_accepted_by_user_id BIGINT,
    handoff_accepted_by_email VARCHAR(255),
    handoff_accepted_at DATETIME,
    assigned_agent_user_id BIGINT,
    assigned_agent_email VARCHAR(255),
    assigned_agent_name VARCHAR(255),
    conference_name VARCHAR(255),
    ai_participant_call_sid VARCHAR(255),
    human_participant_call_sid VARCHAR(255),
    handoff_token VARCHAR(50),
    human_transcript TEXT,
    ai_recording_path VARCHAR(500),
    human_recording_path VARCHAR(500),
    wrap_up_completed_at DATETIME,
    linked_claim_ids JSON,
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_calls_claim_id (claim_id),
    INDEX idx_calls_session_id (session_id),
    INDEX idx_calls_status (status),
    INDEX idx_calls_outcome (outcome),
    INDEX idx_calls_handoff_state (handoff_state),
    INDEX idx_calls_assigned_agent_user_id (assigned_agent_user_id),
    INDEX idx_calls_eleven_labs_conversation_id (eleven_labs_conversation_id),
    INDEX idx_calls_parent_call_id (parent_call_id),
    CONSTRAINT fk_calls_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE SET NULL,
    CONSTRAINT fk_calls_session FOREIGN KEY (session_id) REFERENCES call_sessions (id) ON DELETE SET NULL,
    CONSTRAINT fk_calls_parent_call FOREIGN KEY (parent_call_id) REFERENCES calls (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS call_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    call_id BIGINT NOT NULL,
    claim_id BIGINT NOT NULL,
    use_case VARCHAR(20) NOT NULL,
    claim_status VARCHAR(30),
    paid_amount FLOAT,
    paid_date VARCHAR(10),
    check_or_eft_number VARCHAR(100),
    denial_code VARCHAR(50),
    remark_code VARCHAR(50),
    denial_reason TEXT,
    appeal_deadline VARCHAR(10),
    missing_documents TEXT,
    expected_decision_date VARCHAR(10),
    is_active BOOLEAN,
    coverage_effective_date VARCHAR(10),
    coverage_termination_date VARCHAR(10),
    deductible_annual_cents INT,
    deductible_met_cents INT,
    coinsurance_pct FLOAT,
    copay_cents INT,
    annual_maximum_cents INT,
    annual_max_remaining_cents INT,
    network_status VARCHAR(20),
    frequency_limits JSON,
    waiting_periods JSON,
    reference_number VARCHAR(100),
    rep_name VARCHAR(255),
    next_steps TEXT,
    raw_extraction TEXT NOT NULL,
    confidence FLOAT,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_call_results_call_id (call_id),
    INDEX idx_call_results_claim_id (claim_id),
    CONSTRAINT fk_call_results_call FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE CASCADE,
    CONSTRAINT fk_call_results_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS call_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    call_id BIGINT NOT NULL,
    type VARCHAR(50) NOT NULL,
    message TEXT,
    `timestamp` DATETIME NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_call_events_call_id (call_id),
    INDEX idx_call_events_timestamp (`timestamp`),
    CONSTRAINT fk_call_events_call FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS call_settings (
    `key` VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- scheduler-svc
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_call_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_type VARCHAR(30) NOT NULL,
    ref_id BIGINT NOT NULL,
    scheduled_for DATETIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    triggered_at DATETIME,
    error_message TEXT,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_job_dedup (job_type, ref_id, scheduled_for),
    INDEX idx_scheduled_call_jobs_status (status),
    INDEX idx_scheduled_call_jobs_scheduled_for (scheduled_for)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
