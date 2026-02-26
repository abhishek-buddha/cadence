import { action, mutation } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

/**
 * AI-powered Excel import: Takes raw spreadsheet data (any format/structure)
 * and uses GPT-4o to intelligently map columns to claim fields, match entities,
 * validate data, and flag issues.
 */
export const processExcelData = action({
  args: {
    headers: v.array(v.string()),
    rows: v.array(v.any()),
    sheetName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';

    // Fetch existing entities for matching
    const existingPatients = await ctx.runQuery(api.patients.list);
    const existingInsurance = await ctx.runQuery(api.insuranceContacts.list);
    const existingProviders = await ctx.runQuery(api.providers.list);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('Missing OpenAI API key');

    // Build context about existing entities
    const patientList = (existingPatients || []).map((p: any) => ({
      id: p._id,
      name: `${p.firstName} ${p.lastName}`,
      memberId: p.memberId,
      dob: p.dateOfBirth,
    }));
    const insuranceList = (existingInsurance || []).map((c: any) => ({
      id: c._id,
      name: c.name,
      payerId: c.payerId,
    }));
    const providerList = (existingProviders || []).map((p: any) => ({
      id: p._id,
      name: p.practiceName,
      npi: p.npi,
    }));

    // Send first 3 rows as sample for column mapping, plus all data for processing
    const sampleRows = args.rows.slice(0, 5);
    const today = new Date().toISOString().split('T')[0];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an expert medical billing data analyst. You process Excel spreadsheet data from healthcare organizations to import insurance claims into a CRM system.

Today's date: ${today}

EXISTING DATABASE ENTITIES:
Patients: ${JSON.stringify(patientList)}
Insurance Companies: ${JSON.stringify(insuranceList)}
Providers: ${JSON.stringify(providerList)}

YOUR TASK:
1. Analyze the column headers and data to understand the spreadsheet structure
2. Map each row to our claim format
3. Match patients, insurance companies, and providers to existing records
4. Validate all data and flag any issues
5. Calculate aging buckets based on date of service vs today

CLAIM FORMAT (all fields required unless noted):
- claimNumber: string (unique identifier for the claim)
- patientName: string (for matching/creating patient)
- patientDOB: string (YYYY-MM-DD format, for matching)
- memberId: string (insurance member ID)
- groupNumber: string (optional)
- insuranceName: string (for matching to existing insurance)
- amount: number (in CENTS, e.g. $500.00 = 50000)
- dateOfService: string (YYYY-MM-DD format)
- dateSubmitted: string (optional, YYYY-MM-DD format)
- cptCodes: string[] (optional, array of CPT codes)
- diagnosisCodes: string[] (optional, array of ICD-10 codes)
- status: "pending" | "in_progress" | "paid" | "denied" | "appealing" | "write_off"
- priority: "high" | "medium" | "low"
- notes: string (optional)

MATCHING RULES:
- For patients: Try to match by member ID first, then by name (fuzzy). If no match, set matchedPatientId to null.
- For insurance: Try to match by name (fuzzy match - "BCBS" = "Blue Cross Blue Shield", "UHC" = "UnitedHealthcare"). If no match, set matchedInsuranceId to null.
- For providers: Try to match by name or NPI. If only one provider exists, use it. If no match, set matchedProviderId to null.

AGING BUCKET CALCULATION:
- Calculate days between dateOfService and today (${today})
- 0-30 days, 31-60 days, 61-90 days, 91-120 days, 120+ days

PRIORITY ASSIGNMENT:
- 120+ days aging → high priority
- 61-120 days aging → medium priority
- 0-60 days → low priority
- Denied claims → high priority
- Claims > $10,000 → bump priority up one level

STATUS DETECTION:
- Look for columns like "status", "claim status", "payment status" etc.
- If no status column exists, default to "pending"
- Map common values: "Paid"/"Settled" → "paid", "Rejected"/"Denied" → "denied", etc.

FLAGS/ISSUES (mark any of these):
- "missing_claim_number" - No claim number found
- "missing_patient" - Cannot identify patient
- "missing_insurance" - Cannot identify insurance company
- "missing_amount" - No amount found
- "missing_dos" - No date of service
- "invalid_date" - Date couldn't be parsed
- "invalid_amount" - Amount seems wrong (negative, zero, or extremely high >$1M)
- "duplicate_claim" - Same claim number appears multiple times
- "new_patient" - Patient not found in system, will need to be created
- "new_insurance" - Insurance company not found in system
- "format_warning" - Data format is unusual but parseable

Return a JSON object:
{
  "columnMapping": { "originalHeader": "mappedField", ... },
  "claims": [
    {
      "rowIndex": 0,
      "claimNumber": "CLM-001",
      "patientName": "John Smith",
      "patientFirstName": "John",
      "patientLastName": "Smith",
      "patientDOB": "1985-03-15",
      "memberId": "MBR123",
      "groupNumber": null,
      "insuranceName": "Aetna",
      "matchedPatientId": "existing_id_or_null",
      "matchedInsuranceId": "existing_id_or_null",
      "matchedProviderId": "existing_id_or_null",
      "amount": 50000,
      "dateOfService": "2026-01-15",
      "dateSubmitted": null,
      "cptCodes": ["99213"],
      "diagnosisCodes": [],
      "status": "pending",
      "priority": "medium",
      "agingBucket": "31-60",
      "notes": null,
      "flags": ["new_patient"],
      "flagDetails": ["Patient 'John Smith' not found in system - will be created"]
    }
  ],
  "summary": {
    "totalRows": 10,
    "validClaims": 8,
    "flaggedClaims": 2,
    "issues": ["2 claims have missing patient data"]
  }
}`,
          },
          {
            role: 'user',
            content: `Excel spreadsheet data:
Sheet name: ${args.sheetName || 'Sheet1'}

Column headers: ${JSON.stringify(args.headers)}

Sample rows (first 5): ${JSON.stringify(sampleRows, null, 2)}

ALL rows (${args.rows.length} total): ${JSON.stringify(args.rows)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('OpenAI error:', response.status, errBody);
      throw new Error(`AI processing failed: ${response.status}`);
    }

    const result = await response.json();
    let parsed;
    try {
      parsed = JSON.parse(result.choices[0].message.content);
    } catch {
      throw new Error('AI returned invalid response format');
    }

    return parsed;
  },
});

/**
 * Bulk import claims after AI processing and user confirmation.
 * Creates new patients/insurance contacts as needed, then creates all claims.
 */
export const bulkImportClaims = mutation({
  args: {
    claims: v.array(
      v.object({
        claimNumber: v.string(),
        patientFirstName: v.string(),
        patientLastName: v.string(),
        patientDOB: v.string(),
        memberId: v.string(),
        groupNumber: v.optional(v.string()),
        insuranceName: v.string(),
        matchedPatientId: v.optional(v.string()),
        matchedInsuranceId: v.optional(v.string()),
        matchedProviderId: v.optional(v.string()),
        amount: v.number(),
        dateOfService: v.string(),
        dateSubmitted: v.optional(v.string()),
        cptCodes: v.optional(v.array(v.string())),
        diagnosisCodes: v.optional(v.array(v.string())),
        status: v.string(),
        priority: v.string(),
        agingBucket: v.string(),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();

    // Get existing providers to use as fallback
    const providers = await ctx.db
      .query('providers')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    const defaultProviderId = providers[0]?._id;

    if (!defaultProviderId) {
      throw new Error('No providers found. Please add at least one provider before importing claims.');
    }

    // Track created entities to avoid duplicates within this batch
    const createdPatients = new Map<string, any>();
    const createdInsurance = new Map<string, any>();
    let importedCount = 0;
    const errors: string[] = [];

    for (const claim of args.claims) {
      try {
        // Resolve patient ID
        let patientId = claim.matchedPatientId as any;
        if (!patientId) {
          // Check if we already created this patient in this batch
          const patientKey = `${claim.patientFirstName}_${claim.patientLastName}_${claim.memberId}_${claim.patientDOB}`;
          if (createdPatients.has(patientKey)) {
            patientId = createdPatients.get(patientKey);
          } else {
            // Create new patient
            patientId = await ctx.db.insert('patients', {
              firstName: claim.patientFirstName,
              lastName: claim.patientLastName,
              dateOfBirth: claim.patientDOB || '1900-01-01',
              memberId: claim.memberId || `AUTO-${Date.now()}`,
              groupNumber: claim.groupNumber,
              userId,
              createdAt: now,
              updatedAt: now,
            });
            createdPatients.set(patientKey, patientId);
          }
        }

        // Resolve insurance ID
        let insuranceId = claim.matchedInsuranceId as any;
        if (!insuranceId) {
          const insuranceKey = claim.insuranceName.toLowerCase().trim();
          if (createdInsurance.has(insuranceKey)) {
            insuranceId = createdInsurance.get(insuranceKey);
          } else {
            // Create new insurance contact
            insuranceId = await ctx.db.insert('insuranceContacts', {
              name: claim.insuranceName,
              phone: '+1-800-000-0000',
              userId,
              createdAt: now,
              updatedAt: now,
            });
            createdInsurance.set(insuranceKey, insuranceId);
          }
        }

        // Resolve provider ID
        const providerId = (claim.matchedProviderId as any) || defaultProviderId;

        // Create the claim
        await ctx.db.insert('claims', {
          claimNumber: claim.claimNumber,
          patientId,
          insuranceContactId: insuranceId,
          providerId,
          amount: claim.amount,
          dateOfService: claim.dateOfService,
          dateSubmitted: claim.dateSubmitted,
          cptCodes: claim.cptCodes,
          diagnosisCodes: claim.diagnosisCodes,
          status: claim.status,
          priority: claim.priority,
          agingBucket: claim.agingBucket,
          notes: claim.notes,
          userId,
          createdAt: now,
          updatedAt: now,
        });

        importedCount++;
      } catch (err: any) {
        errors.push(`Row "${claim.claimNumber}": ${err.message}`);
      }
    }

    return {
      importedCount,
      totalAttempted: args.claims.length,
      errors,
      newPatientsCreated: createdPatients.size,
      newInsuranceCreated: createdInsurance.size,
    };
  },
});
