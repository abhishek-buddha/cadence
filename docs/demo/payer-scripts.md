# Payer Scripts — Cheat Sheet

You are the insurance representative. Cadence's AI agent will call your phone. Read the appropriate script verbatim. Bold = key data point Cadence must extract. Italics at end = expected outcome classification.

---

## MEDICAL CLAIMS

### M1 — Paid in full (expect: `successful`)
> "This is **Sarah at Aetna**. I'm looking up claim **CLM-2026-001** for John Smith, date of birth March 15th 1985, member ID **W123456789**. That claim was **paid in full** on **April 10th 2026**. Payment amount **$500**, EFT number **EFT-2026-04-12345**. Reference number **AETNA-REF-987654**. Anything else?"
*outcome: successful — all 6 required medical-paid fields retrieved*

### M2 — Denied CO-45 (expect: `successful`)
> "This is **Mike at Cigna**. That claim was **denied** with reason code **CO-45 — charges exceed our fee schedule**. Patient responsibility is two hundred dollars. Appeal deadline is **July 10th 2026**. Reference number **CIGNA-REF-555101**."
*outcome: successful — all denied-status fields retrieved*

### M3 — Denied PR-96 (expect: `successful`)
> "This is **Linda at UnitedHealthcare**. That claim was **denied — PR-96, non-covered service**. Patient is responsible for the full amount. Appeal deadline **June 30th 2026**. Reference **UHC-REF-998877**."
*outcome: successful*

### M4 — Pending review (expect: `successful`)
> "This is **Carlos at Anthem**. The claim is currently **in processing review**. Expected decision date is **April 30th 2026**. Reference **ANTHEM-REF-44221**."
*outcome: successful — pending status only requires status + decision date + reference + repName*

### M5 — Partial info — rep refuses (expect: `partial`)
> "This is the rep. The claim is **paid**, that's all I can pull up right now. You'll have to call back for payment details. I can't give you a reference number either, our system is down."
*outcome: partial — claimStatus retrieved; missing paidAmount, paidDate, checkOrEftNumber, referenceNumber*

### M6 — Voicemail (expect: `failed`)
> *(answer with)* "You've reached the Acme Health claims voicemail. Please leave a message after the tone." *(then say nothing for 5 seconds, hang up)*
*outcome: failed — call status = voicemail, no fields retrieved*

### M7 — Wrong claim number (rep can't find) (expect: `partial` or `failed`)
> "I can't find that claim number in our system. Are you sure it's correct? *(pause)* No, nothing comes up. Reference number for this call is **REF-NOTFOUND-001**."
*outcome: partial — repName + reference retrieved; no claim data*

---

## DENTAL ELIGIBILITY VERIFICATION

### D1 — Active coverage, deductible met (expect: `successful`)
> "This is **Maria at Delta Dental**. Verifying eligibility for John Smith, date of birth March 15th 1985, member ID **DD12345678**. Patient is **active** under PPO plan. **Annual maximum $1500**, **remaining $750**. Annual **deductible $50, met fully**. **Coinsurance 80% in network, 50% out of network**. Patient is **in-network**. Frequency for D1110 cleaning is **two per year, one used**. No active waiting periods for proposed CDT codes. Reference number **DD-REF-2026-0001**."
*outcome: successful — all 8 required dental-active fields retrieved*

### D2 — Inactive coverage (expect: `successful`)
> "This is **Tom at MetLife Dental**. That member is **inactive**. Coverage **terminated December 31st 2025**. Reference **MLF-REF-2026-0002**."
*outcome: successful — only requires isActive + repName + reference for inactive case*

### D3 — Out of network (expect: `successful`)
> "This is **Aisha at Cigna Dental**. Patient is **active** under preferred plan. **Annual max $2000, remaining $2000** (nothing used yet). **Deductible $75, $0 met**. **Coinsurance 50% out-of-network**, patient is **out-of-network** with this provider. **No frequency limits exceeded**. No waiting periods active. Reference **CIGNA-DENT-REF-3344**."
*outcome: successful — all fields retrieved with out-of-network flagged*

### D4 — Frequency exceeded (expect: `successful`)
> "This is **Brad at Aetna Dental**. Patient is **active**, plan ID is on file. **Annual max $1500, remaining $1500**. **Deductible $50, $25 met**. Coinsurance **100% preventive in-network**. Patient is **in-network**. Frequency for D1110 cleaning is **two per year, both used**. Patient has reached the cleaning limit for this calendar year — additional cleanings are non-covered. Reference **AETNA-DENT-REF-7788**."
*outcome: successful — frequency limits captured*

### D5 — Rep refuses frequencies (expect: `partial`)
> "This is the rep. Patient is **active**, **deductible $50 met**, **annual max $2000 remaining $1500**, **coinsurance 80%**, **in-network**. I don't have frequencies in front of me — you'd need to check the provider portal for that. Reference is **REF-9911**."
*outcome: partial — missing frequencyLimits and waitingPeriods*

---

## MULTI-PATIENT SESSION

### MP1 — All 3 patients allowed (expect: session `successful`, all items `successful`)

After Cadence's agent reads identifying info for **patient 1**:
> "Got it. That claim is **paid in full**, $300 on April 5th, EFT-2026-04-555, reference REF-001-A. Anything else?"

When agent says "yes, may we look up patient 2":
> "Sure, what's the patient name and member ID?" *(let agent state it)* "Okay that one's **denied, CO-97 not medically necessary**, appeal deadline July 15th 2026, reference REF-001-B."

When agent moves to patient 3:
> "Last one — that's **in processing**, expected decision May 5th 2026, reference REF-001-C. Anything else? No? Have a great day."
*outcome: session=successful (3 successful items)*

### MP2 — Rep refuses 2nd patient (expect: session `partial`)

After patient 1 paid script:
> "I'm sorry, our policy is one patient per call. You'll have to call back for the others. Reference REF-002-A. Have a great day."
*outcome: session=partial (1 successful + 2 refused_by_payer)*

---

## TRANSFER

### T1 — Rep transfers to supervisor (expect: outcome=`transferred_to_human`)
> "I need to transfer you to my supervisor for that. One moment please."

*(then hang up — Cadence should record the transfer event and not penalize the missing fields)*

---

## VOICE-IVR

### V1 — Voice-only menu
*(answer phone with — speak slowly):*
> "Welcome to Acme Health. For claims, say claims or press 1. For eligibility, say eligibility or press 2. For prior authorization, say prior auth or press 3."

Wait for Cadence agent to say "claims" or press 1, then continue with M1 paid script.

---

## UNCOOPERATIVE REP (edge cases)

### E1 — Hold + transfer (expect: `transferred_to_human`)
> "Please hold." *(silence 30 sec)* "Thanks for holding. Actually I need to transfer you to escalations." *(hang up)*

### E2 — Drops mid-call (expect: `failed`)
Read partial of M1 script then hang up abruptly mid-sentence after stating only the patient name.
