#!/usr/bin/env python3
"""One-shot migration: loads the pre-rewrite Convex export
(Ace-Cadence-old/convex-export.zip) into the new backend via its own REST
API (http://localhost/api/... through nginx) — not a direct DB write, so it
exercises the exact same validation every other caller goes through.

Handles the ID remapping Convex -> MySQL needs (Convex used string _id
references; the new schema uses auto-increment integers), in dependency
order: providers/insurance-contacts/patients (no dependencies) -> claims
(needs all three) -> calls (needs claims) -> call-results (needs calls +
claims).

Run from the EC2 instance, from the Ace-Cadence/ directory:
    python3 scripts/migrate_convex_export.py

Safe to re-run only after wiping the target tables first — it always
creates new rows, it doesn't check for existing ones.
"""

import json
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

BASE = "http://localhost/api"
EXPORT_ZIP = Path(__file__).resolve().parent.parent.parent / "Ace-Cadence-old" / "convex-export.zip"


def to_mysql_datetime(value):
    """Convex exports timestamps as ISO 8601 with a trailing 'Z'
    (e.g. '2026-02-18T10:56:39.683Z'). MySQL's implicit string->DATETIME
    conversion doesn't accept that suffix and will reject the insert under
    strict SQL mode (the default in MySQL 8) — parse it into a real
    datetime and re-format the way MySQL expects."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")


def to_date_string(value):
    """A couple of fields (claims.next_follow_up_date,
    call_results.expected_decision_date) are VARCHAR(10) plain dates in the
    new schema, but a few Convex records have a full timestamp in them
    instead — truncate to the date portion so it fits."""
    if not value:
        return None
    return value[:10]


def call_api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        print(f"FAILED {method} {path}: {exc.code} {exc.read().decode()}", file=sys.stderr)
        raise


def read_table(zf, name):
    with zf.open(f"{name}/documents.jsonl") as f:
        return [json.loads(line) for line in f.read().decode().splitlines() if line.strip()]


def migrate_providers(zf):
    id_map = {}
    for p in read_table(zf, "providers"):
        created = call_api("POST", "/master-data/providers", {
            "practice_name": p["practiceName"],
            "npi": p["npi"],
            "tax_id": p["taxId"],
            "address": p["address"],
            "phone": p["phone"],
            "specialty": p.get("specialty"),
        })
        id_map[p["_id"]] = created["id"]
    print(f"providers migrated: {len(id_map)}")
    return id_map


def migrate_insurance_contacts(zf):
    id_map = {}
    for c in read_table(zf, "insuranceContacts"):
        created = call_api("POST", "/master-data/insurance-contacts", {
            "name": c["name"],
            "phone": c["phone"],
            "department": c.get("department"),
            "payer_id": c.get("payerId"),
            "hours": c.get("hours"),
            "avg_hold_time": c.get("avgHoldTime"),
            "verification_requirements": c.get("verificationRequirements"),
        })
        id_map[c["_id"]] = created["id"]
    print(f"insurance contacts migrated: {len(id_map)}")
    return id_map


def migrate_patients(zf):
    id_map = {}
    for p in read_table(zf, "patients"):
        created = call_api("POST", "/master-data/patients", {
            "first_name": p["firstName"],
            "last_name": p["lastName"],
            "date_of_birth": p["dateOfBirth"],
            "member_id": p["memberId"],
            "group_number": p.get("groupNumber"),
            "policy_number": p.get("policyNumber"),
            "subscriber_name": p.get("subscriberName"),
            "relationship": p.get("relationship"),
        })
        id_map[p["_id"]] = created["id"]
    print(f"patients migrated: {len(id_map)}")
    return id_map


def migrate_claims(zf, patient_map, insurance_map, provider_map):
    id_map = {}
    skipped = 0
    for c in read_table(zf, "claims"):
        if c["patientId"] not in patient_map or c["insuranceContactId"] not in insurance_map or c["providerId"] not in provider_map:
            skipped += 1
            continue
        created = call_api("POST", "/claims", {
            "use_case": "medical_claim",
            "claim_number": c["claimNumber"],
            "patient_id": patient_map[c["patientId"]],
            "insurance_contact_id": insurance_map[c["insuranceContactId"]],
            "provider_id": provider_map[c["providerId"]],
            "date_of_service": c["dateOfService"],
            "status": c["status"],
            "priority": c.get("priority", "medium"),
            "notes": c.get("notes"),
            "amount": c.get("amount"),
            "date_submitted": c.get("dateSubmitted"),
            "cpt_codes": c.get("cptCodes"),
            "diagnosis_codes": c.get("diagnosisCodes"),
            "aging_bucket": c.get("agingBucket"),
            "denial_code": c.get("denialCode"),
            "denial_reason": c.get("denialReason"),
            "appeal_deadline": c.get("appealDeadline"),
            "reference_number": c.get("referenceNumber"),
        })
        new_id = created["id"]
        id_map[c["_id"]] = new_id

        followup_body = {}
        if c.get("lastCalledAt"):
            followup_body["last_called_at"] = to_mysql_datetime(c["lastCalledAt"])
        if c.get("nextFollowUpDate"):
            followup_body["next_follow_up_date"] = to_date_string(c["nextFollowUpDate"])
        if followup_body:
            call_api("PATCH", f"/claims/{new_id}/followup", followup_body)

    print(f"claims migrated: {len(id_map)} (skipped {skipped} with a dangling reference)")
    return id_map


def migrate_calls(zf, claim_map, insurance_map):
    id_map = {}
    skipped = 0
    for c in read_table(zf, "calls"):
        if c["insuranceContactId"] not in insurance_map:
            skipped += 1
            continue
        body = {
            "insurance_contact_id": insurance_map[c["insuranceContactId"]],
            "status": c["status"],
            "started_at": to_mysql_datetime(c["startedAt"]),
        }
        if c.get("claimId") in claim_map:
            body["claim_id"] = claim_map[c["claimId"]]
        created = call_api("POST", "/calls", body)
        new_id = created["id"]

        update_body = {
            "eleven_labs_conversation_id": c.get("elevenLabsConversationId"),
            "twilio_call_sid": c.get("twilioCallSid"),
            "duration": c.get("duration"),
            "transcript": c.get("transcript"),
            "completed_at": to_mysql_datetime(c.get("completedAt")),
        }
        update_body = {k: v for k, v in update_body.items() if v is not None}
        if update_body:
            call_api("PATCH", f"/calls/{new_id}", update_body)

        id_map[c["_id"]] = new_id

    print(f"calls migrated: {len(id_map)} (skipped {skipped} with a dangling reference)")
    return id_map


def migrate_call_results(zf, call_map, claim_map):
    count = 0
    skipped = 0
    for r in read_table(zf, "callResults"):
        if r["callId"] not in call_map or r["claimId"] not in claim_map:
            skipped += 1
            continue
        call_api("POST", "/call-results", {
            "call_id": call_map[r["callId"]],
            "claim_id": claim_map[r["claimId"]],
            "use_case": "medical_claim",
            "claim_status": r.get("claimStatus"),
            "paid_amount": r.get("paidAmount"),
            "denial_code": r.get("denialCode"),
            "denial_reason": r.get("denialReason"),
            "appeal_deadline": to_date_string(r.get("appealDeadline")),
            "missing_documents": r.get("missingDocuments"),
            "expected_decision_date": to_date_string(r.get("expectedDecisionDate")),
            "reference_number": r.get("referenceNumber"),
            "next_steps": r.get("nextSteps"),
            "raw_extraction": r.get("rawExtraction") or "{}",
            "confidence": r.get("confidence"),
        })
        count += 1
    print(f"call results migrated: {count} (skipped {skipped} with a dangling reference)")


def main():
    if not EXPORT_ZIP.exists():
        print(f"Export not found at {EXPORT_ZIP}", file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(EXPORT_ZIP) as zf:
        provider_map = migrate_providers(zf)
        insurance_map = migrate_insurance_contacts(zf)
        patient_map = migrate_patients(zf)
        claim_map = migrate_claims(zf, patient_map, insurance_map, provider_map)
        call_map = migrate_calls(zf, claim_map, insurance_map)
        migrate_call_results(zf, call_map, claim_map)


if __name__ == "__main__":
    main()
