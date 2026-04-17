# Cadence — Security and Compliance

**Document:** Security & Compliance Whitepaper
**Version:** 1.0
**Date:** 2026-04-17
**Prepared for:** Medusind LLC
**Prepared by:** Cadence (Algonox)
**Classification:** Confidential — RFP Response Artifact

---

## 1. HIPAA Framework Adherence

Cadence is designed and operated to meet the requirements of the Health Insurance Portability and Accountability Act of 1996 and the implementing regulations at 45 CFR Parts 160, 162, and 164. The platform processes Protected Health Information (PHI) on behalf of Medusind in the role of a Business Associate.

### 1.1 Privacy Rule (45 CFR Part 164 Subpart E)

| Requirement | Cadence Control |
|---|---|
| Minimum necessary use and disclosure (§164.502(b)) | Role-based access control restricts each user to the minimum data set required for their role. API key scopes enforce the same principle for system-to-system access. |
| Permitted uses and disclosures (§164.506) | PHI is processed solely for treatment, payment, and healthcare operations as authorized by the Business Associate Agreement with Medusind. |
| Patient access rights (§164.524) | All patient data is exportable on request via the `GET /v1/eligibility-cases/{id}` and `GET /v1/claim-cases/{id}` endpoints; bulk export is available through a documented data subject access request workflow. |
| Amendment rights (§164.526) | All PHI tables expose `PATCH` semantics and audit-logged change history. |
| Accounting of disclosures (§164.528) | Every PHI access and modification is recorded in the immutable audit log with user, time, action, and resource. |

### 1.2 Security Rule (45 CFR Part 164 Subpart C)

Implementation specifications mapped to Cadence controls:

| Standard | Specification | Cadence Implementation |
|---|---|---|
| §164.308(a)(1) Security Management | Risk analysis | Annual third-party HIPAA Security Risk Analysis; quarterly internal review |
| §164.308(a)(3) Workforce Security | Authorization, supervision, termination | RBAC with documented approval workflow; quarterly access review; same-day deprovisioning on termination |
| §164.308(a)(4) Information Access Management | Access authorization | Per-tenant API keys with scope; SSO with conditional access policies enforced by IdP |
| §164.308(a)(5) Security Awareness | Training | All Cadence personnel complete HIPAA awareness training annually; documented |
| §164.308(a)(6) Security Incident Procedures | Response and reporting | Documented incident response runbook; P0/P1/P2 SLAs; breach notification template per §164.404–414 |
| §164.308(a)(7) Contingency Plan | Backup, DR, emergency mode | RPO ≤ 15 min, RTO ≤ 1 h; warm-standby region; quarterly DR game days |
| §164.310(a)(1) Facility Access | Physical safeguards | All processing in HIPAA-eligible cloud regions; AWS / Azure inherits SOC 2 + ISO 27001 controls |
| §164.310(d)(1) Device and Media Controls | Disposal, reuse | Encrypted-at-rest storage; cryptographic erasure on volume disposal |
| §164.312(a)(1) Access Control | Unique user ID, emergency access, automatic logoff, encryption | Per-user identity via SSO; 30-min idle session timeout; field-level encryption for PHI |
| §164.312(b) Audit Controls | Hardware, software, procedural mechanisms | Immutable audit log with 6-year retention; Object-Lock S3 archive |
| §164.312(c)(1) Integrity | Mechanism to authenticate ePHI | HMAC integrity tags on critical fields; database checksums; backup integrity verification |
| §164.312(d) Person or Entity Authentication | Verify identity | SSO with MFA enforced by IdP; API key + optional IP allowlist for machine accounts |
| §164.312(e)(1) Transmission Security | Integrity and encryption | TLS 1.3 enforced; certificate pinning for subprocessor calls; mutual TLS available for in-tenant deployments |

### 1.3 Breach Notification Rule (45 CFR Part 164 Subpart D)

Cadence's incident response plan includes:

- Discovery and triage within one hour of detection (P0)
- Internal notification to Cadence Security Officer and CEO within four hours
- Customer notification (Medusind Privacy Officer) within 24 hours of confirmation
- Forensic investigation and documented root-cause analysis
- Breach reporting to HHS within the 60-day window required by §164.408 (Cadence assists Medusind in preparing required notices)
- Post-incident review and corrective action plan

A redacted breach notification template is provided in Appendix A of the incident response runbook (delivered separately to Medusind's compliance team on contract execution).

---

## 2. Subprocessor Business Associate Agreement Matrix

Every subprocessor that touches PHI in the Cadence-managed deployment is BAA-covered. In the in-tenant deployment, infrastructure subprocessors are replaced by Medusind's existing cloud arrangements.

| Subprocessor | Service Provided | PHI Touchpoint | BAA Status | Notes |
|---|---|---|---|---|
| Twilio, Inc. | Outbound voice, recording, media streaming | Voice audio, recordings, transcripts in transit | HIPAA-eligible workspace, BAA executed | Voice, SIP, Recordings products are HIPAA-eligible; SMS not used for PHI |
| ElevenLabs, Inc. | Conversational AI, real-time STT and TTS | Live transcript, synthesized voice | Enterprise tier with BAA | Standard plans are not HIPAA-eligible; Cadence uses Enterprise exclusively for production |
| Microsoft Corporation (Azure OpenAI) | Post-call transcript reasoning | Transcript text | Azure BAA covers Azure OpenAI in HIPAA-eligible commercial regions | Private endpoint enforced; data not used for model training per Azure terms |
| Amazon Web Services, Inc. | Compute, database, object storage, KMS | Database content, recordings, transcripts | AWS BAA executed at account level | Used for Cadence-managed deployment; replaced by Medusind cloud in in-tenant model |
| Cloudflare, Inc. | Static asset CDN, edge WAF | None — PHI does not traverse Cloudflare | BAA available, not required given no PHI flow | Frontend assets only |
| Microsoft Entra ID / Okta | Identity assertions for SSO | Identity claims (no clinical PHI) | Customer-side IdP — BAA with Medusind, not Cadence | Cadence is a service provider in the SAML federation |

[Medusind to confirm] any additional subprocessors prohibited under Medusind procurement policy.

---

## 3. Data Residency

All processing occurs in the United States. Default region for the Cadence-managed deployment is AWS US East (N. Virginia) with warm standby in AWS US West (Oregon). Cross-border data transfer is blocked by VPC egress controls and provider-level region pinning.

For the in-tenant deployment, Medusind selects the region and Cadence respects the chosen boundary; no Cadence service or data path crosses outside the chosen region.

[Medusind to confirm] preferred region and any state-specific residency constraints (e.g., CMIA in California, NY SHIELD).

---

## 4. Encryption

### 4.1 At Rest

- **Database:** AWS RDS storage encrypted at the volume level using AWS KMS with a customer-managed CMK. Field-level encryption is applied to PHI columns (member ID, date of birth, SSN, TIN) using `pgcrypto` with a tenant-scoped data encryption key (DEK) wrapped by the CMK.
- **Object storage:** AWS S3 server-side encryption with AWS KMS customer-managed CMKs (SSE-KMS). Distinct CMKs per environment (production, staging, audit-archive).
- **Backups:** Encrypted at rest using KMS; cross-region replicated snapshots encrypted with destination-region CMK.
- **Application secrets:** Stored in AWS Secrets Manager with KMS encryption; rotated quarterly for service credentials and annually for KMS CMKs.

### 4.2 In Transit

- **External:** TLS 1.3 enforced on all client-facing endpoints (frontend, API, webhook outbound). TLS 1.2 supported as a downgrade only for legacy webhook subscribers; logged and reported.
- **Subprocessor:** TLS 1.3 for all calls to Twilio, ElevenLabs, Azure OpenAI. Certificate pinning is enabled for Azure OpenAI (private endpoint) and ElevenLabs Enterprise endpoint.
- **Internal:** Service mesh (Istio in Kubernetes deployments) enforces mutual TLS between Cadence services. RDS and ElastiCache require TLS for client connections.

### 4.3 Field-Level Encryption Coverage

The following columns are encrypted at the field level:

- `patients.dateOfBirth`
- `patients.memberId`
- `patients.ssn` (where collected)
- `patients.firstName` (in tenant-elected high-sensitivity mode)
- `patients.lastName` (in tenant-elected high-sensitivity mode)
- `providers.tin`
- `users.email` (hashed for lookup, encrypted for display)

---

## 5. Access Controls

### 5.1 Human Users

- Single sign-on via SAML 2.0 (Microsoft Entra ID, Okta)
- Multi-factor authentication enforced by the identity provider; Cadence honors the IdP's `AuthnContextClassRef` and re-prompts for step-up where requested
- Session lifetime: 8 hours absolute, 30 minutes idle, with explicit logout
- Conditional access policies (geo-fence, device compliance) enforced at the IdP layer per Medusind's existing posture

### 5.2 Machine Accounts

- API keys with scoped permissions (read, write, admin)
- Optional IP address allowlist per key
- Optional rate limit override per key
- Mandatory key rotation every 365 days; warning starts at 30 days remaining

### 5.3 Cadence Personnel

- Production access requires named-user JIT request with documented business justification, time-boxed (default 4 hours), and recorded (terminal recording for SSH/kubectl, video recording for console)
- Quarterly access review with documented attestation
- Same-day deprovisioning on termination, verified by SCIM lifecycle integration with the corporate IdP

---

## 6. Audit Logging

Every PHI access and modification is recorded to an immutable audit log:

- **Storage:** PostgreSQL append-only table with row-level security; nightly export to AWS S3 with Object Lock (governance mode, 6-year retention) for tamper-evidence
- **Retention:** Default six years (HIPAA minimum); configurable longer per tenant contract
- **Coverage:** Authentication events, authorization decisions, all reads and writes to PHI tables, configuration changes, key rotations, support access events, webhook delivery attempts
- **Schema:** `auditEvents { id, tenantId, userId, action, resourceType, resourceId, ipAddress, userAgent, payloadHash, timestamp }`
- **Tamper evidence:** Each entry carries an HMAC chain hash; daily attestation log produces a Merkle root that can be archived externally for forensic verification
- **Access:** Read-only via `GET /v1/audit-events` (Admin role only); export to CSV / JSON / SIEM via webhook or scheduled S3 push

---

## 7. Network Controls

### 7.1 Cadence-Managed Deployment

- VPC with public and private subnets across three availability zones
- Application tiers (frontend, API, bridge, workers) in private subnets only; load balancers terminate TLS in public subnets
- Database, cache, queue in private subnets with security-group restriction to application tiers only
- Egress to subprocessors via NAT gateway with logged flow
- Where supported, private connectivity to subprocessors:
  - Azure OpenAI: Azure Private Endpoint via VPC peering
  - AWS S3: VPC gateway endpoint
  - AWS KMS: VPC interface endpoint
- AWS WAF rules in front of public ALBs (OWASP Top 10 baseline + Cadence rule pack)

### 7.2 In-Tenant Deployment

Medusind retains ownership of the network boundary. Cadence ships:

- Helm chart with documented egress requirements (Twilio, ElevenLabs, Azure OpenAI endpoints with IP ranges)
- NetworkPolicy manifests restricting pod-to-pod traffic to the minimum required
- Recommended Kubernetes Pod Security Admission profile (`restricted`)
- Optional Istio service mesh manifests for mTLS-by-default

---

## 8. Vulnerability Management

| Activity | Cadence | Medusind |
|---|---|---|
| Dependency scanning (Snyk + Dependabot) | Weekly + per-commit | Receives advisory on critical CVEs |
| Static application security testing (Semgrep with healthcare rule pack) | Per-commit blocking | Findings shared on request |
| Dynamic application security testing (OWASP ZAP automated scan) | Per-release blocking on P0 findings | Reports shared per release |
| Container image scanning (Trivy + ECR image scanning) | Per-build blocking on critical CVEs | N/A |
| Penetration test (third-party) | Annual minimum, after major releases | Report executive summary shared |
| Bug bounty (HackerOne, private program) | Continuous (post-pilot) | Coordinated disclosure |
| Secret scanning (Gitleaks + TruffleHog) | Pre-commit + CI | N/A |

[Medusind to confirm] preferred third-party penetration test vendor for joint test coordination.

---

## 9. Incident Response

### 9.1 Severity and SLAs

| Severity | Definition | Response | Resolution Target |
|---|---|---|---|
| P0 | Confirmed breach, data exposure, total outage, or regulatory event | < 1 hour 24/7 page | < 4 hours mitigation, < 24 hours full resolution |
| P1 | Major degradation, single-tenant outage, security event without confirmed exposure | < 1 hour business hours, < 4 hours after-hours | < 8 hours mitigation |
| P2 | Minor degradation, isolated user-facing bug | < 4 hours business hours | < 3 business days |
| P3 | Cosmetic, low-impact | Next business day | Per release cycle |

### 9.2 Breach Response Workflow

1. **Detect** — anomaly alert, user report, or external notification
2. **Triage** — Security Officer assigns severity within 1 hour
3. **Contain** — revoke compromised credentials, isolate affected systems, snapshot evidence
4. **Notify (internal)** — CEO, Privacy Officer, Legal within 4 hours
5. **Investigate** — preserve audit logs, network flows, application traces; document root cause
6. **Notify (Medusind)** — within 24 hours of confirmed PHI involvement, per BAA terms
7. **Notify (HHS, individuals)** — Cadence assists Medusind with preparation; sent within 60 days per §164.404–408
8. **Remediate** — implement permanent corrective action; verify with monitoring
9. **Post-mortem** — published within 30 days; corrective actions tracked to closure

---

## 10. Backup and Disaster Recovery

| Aspect | Approach |
|---|---|
| Database backups | RDS automated daily snapshots, 35-day retention; cross-region replication; PITR with 7-day WAL |
| Recording and transcript backups | S3 cross-region replication; Glacier transition after 90 days |
| Configuration backups | Helm values and Terraform state in private Git, encrypted with SOPS + AWS KMS |
| Audit log backups | Daily Object-Locked S3 archive with 6-year retention |
| Recovery Point Objective | ≤ 15 minutes |
| Recovery Time Objective | ≤ 1 hour |
| DR test cadence | Quarterly game day with documented results; report shared with Medusind compliance |

---

## 11. Data Deletion and Right to Erasure

Cadence honors data deletion requests in compliance with the BAA termination provisions and patient rights under HIPAA and applicable state law (CCPA / CPRA where relevant).

- **Soft delete** is the default for all PHI; deleted records are flagged and excluded from queries while retained for the configured grace period (default 90 days)
- **Hard delete** occurs on a schedule per the tenant retention policy; cryptographic erasure is applied to recordings (per-recording DEK destruction)
- **BAA termination** triggers full PHI deletion within 30 days of termination effective date, with a signed Certificate of Destruction provided to Medusind
- **Patient erasure requests** are honored within 30 days; Cadence supports the request workflow but the legal determination remains with Medusind as the covered entity

---

## 12. Compliance Roadmap

| Item | Status | Target Date |
|---|---|---|
| HIPAA Security Risk Analysis (third party) | Underway | 2026-Q3 |
| SOC 2 Type II audit | Planned | 2027-Q1 (first observation period 2026-Q4) |
| HITRUST CSF certification (e1 self-assessment) | Planned | 2027-Q2 |
| HITRUST CSF certification (i1 validated) | Planned | 2028-Q1 |
| HITRUST CSF certification (r2 certified) | Planned | 2028-Q4 |
| ISO 27001 certification | Under evaluation | TBD |
| Annual third-party penetration test | Recurring | Q4 each year |

[Medusind to confirm] the certifications required for production go-live; Cadence will commit to acceleration if Medusind procurement requires earlier dates.

---

**End of Security & Compliance Whitepaper.**
