-- Preserves existing data. Run through python -m app.migrate_appointments before enabling.
CREATE TABLE IF NOT EXISTS appointments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    appointment_type VARCHAR(100) NOT NULL,
    scheduled_at DATETIME NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    location VARCHAR(255) NOT NULL,
    instructions TEXT,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    callback_requested_at DATETIME,
    callback_reason VARCHAR(500),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_appointments_patient (patient_id),
    INDEX idx_appointments_scheduled (scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appointment_calls (
    call_id BIGINT PRIMARY KEY,
    appointment_id BIGINT NOT NULL,
    identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
    transcription_error VARCHAR(255),
    INDEX idx_appointment_calls_appointment (appointment_id),
    CONSTRAINT fk_appointment_calls_call FOREIGN KEY (call_id) REFERENCES calls (id),
    CONSTRAINT fk_appointment_calls_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE calls MODIFY COLUMN insurance_contact_id BIGINT NULL;
ALTER TABLE patients ADD COLUMN phone VARCHAR(20) NULL;
ALTER TABLE appointments ADD COLUMN confirmed_at DATETIME NULL;
ALTER TABLE appointments ADD COLUMN original_scheduled_at DATETIME NULL;
ALTER TABLE appointments ADD COLUMN original_timezone VARCHAR(64) NULL;
ALTER TABLE appointment_calls ADD COLUMN pending_booking_change JSON NULL;
ALTER TABLE appointments ADD COLUMN call_status_override VARCHAR(20) NULL;
