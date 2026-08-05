import { action, mutation } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

function generateCaseNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
  return `EV-${ymd}-${rand}`;
}

/**
 * AI-powered Excel import for dental EV cases.
 * Takes raw spreadsheet data (any column structure) and uses GPT to map
 * columns, match entities, validate CDT codes, and flag data quality issues.
 */
export const processExcelData = action({
  args: {
    headers: v.array(v.string()),
    rows: v.array(v.any()),
    sheetName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingPatients = await ctx.runQuery(api.patients.list);
    const existingInsurance = await ctx.runQuery(api.insuranceContacts.list);
    const existingProviders = await ctx.runQuery(api.providers.list);
    const existingPlans = await ctx.runQuery(api.dentalPlans?.list ?? (null as any));

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('Missing OpenAI API key');

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
    const planList = (existingPlans || []).map((p: any) => ({
      id: p._id,
      name: p.planName,
      payerName: p.payerName,
    }));

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
            content: `You are an expert dental billing analyst. You process Excel spreadsheet data from dental practices to import eligibility verification cases into a dental billing CRM.

Today's date: ${today}

EXISTING DATABASE ENTITIES:
Patients: ${JSON.stringify(patientList)}
Insurance Companies: ${JSON.stringify(insuranceList)}
Providers: ${JSON.stringify(providerList)}
Dental Plans: ${JSON.stringify(planList)}

YOUR TASK:
1. Analyze the column headers and data to understand the spreadsheet structure
2. Map each row to our dental EV case format
3. Match patients, insurance companies, providers, and plans to existing records
4. Validate CDT codes and dates
5. Flag any data quality issues

DENTAL EV CASE FORMAT:
- patientName: string (full name for matching)
- patientFirstName: string
- patientLastName: string
- patientDOB: string (YYYY-MM-DD)
- memberId: string (insurance member ID)
- groupNumber: string (optional)
- insuranceName: string (dental insurance company name)
- planName: string (optional, specific dental plan name)
- cdtCodes: string[] (array of CDT codes like D0150, D1110, D2740)
- proposedDateOfService: string (YYYY-MM-DD — the upcoming appointment date)
- providerName: string (optional, dental practice name)
- notes: string (optional)

MATCHING RULES:
- Patients: match by member ID first, then by name. Set matchedPatientId to null if no match.
- Insurance: fuzzy match by name (e.g. "Delta" = "Delta Dental", "Aetna Dental" = "Aetna"). Set matchedInsuranceId to null if no match.
- Providers: match by name or NPI. If only one provider exists, always use it. Set matchedProviderId to null if no match.
- Dental Plans: match by plan name + payer name. Set matchedPlanId to null if no match.

CDT CODE VALIDATION:
- Valid CDT codes start with D followed by 4 digits (e.g. D0150, D1110, D2740)
- Accept comma-separated codes in a single cell
- Accept codes with or without the D prefix (add D if missing)
- Common codes: D0150 (comprehensive eval), D0274 (bitewing x-rays), D1110 (prophylaxis adult), D2140 (amalgam), D2330 (resin composite), D2740 (crown), D3310 (root canal), D4341 (perio scaling), D7210 (extraction)

PROPOSED DATE OF SERVICE:
- This is the UPCOMING appointment date, not a past date
- If date is in the past, flag it as "past_dos" warning but still include it
- Format as YYYY-MM-DD

FLAGS:
- "missing_patient" — cannot identify patient name
- "missing_payer" — cannot identify insurance company
- "missing_cdt" — no CDT codes found
- "invalid_dos" — date of service couldn't be parsed
- "past_dos" — date of service is in the past (warning only)
- "new_patient" — patient not in system, will be created
- "new_payer" — insurance not in system, will be created
- "duplicate_case" — similar case already exists (same patient + payer + dos)
- "format_warning" — unusual data format but parseable
- "invalid_cdt" — CDT code format invalid

Return a JSON object:
{
  "columnMapping": { "originalHeader": "mappedField" },
  "cases": [
    {
      "rowIndex": 0,
      "patientName": "John Smith",
      "patientFirstName": "John",
      "patientLastName": "Smith",
      "patientDOB": "1985-03-15",
      "memberId": "W123456789",
      "groupNumber": "GRP001",
      "insuranceName": "Aetna",
      "planName": null,
      "matchedPatientId": "existing_id_or_null",
      "matchedInsuranceId": "existing_id_or_null",
      "matchedProviderId": "existing_id_or_null",
      "matchedPlanId": null,
      "cdtCodes": ["D0150", "D1110"],
      "proposedDateOfService": "2026-05-15",
      "providerName": null,
      "notes": null,
      "flags": ["new_patient"],
      "flagDetails": ["Patient 'John Smith' not found in system — will be created on import"]
    }
  ],
  "summary": {
    "totalRows": 10,
    "validCases": 8,
    "flaggedCases": 2,
    "issues": ["2 cases have missing patient data"]
  }
}`,
          },
          {
            role: 'user',
            content: `Dental EV spreadsheet data:
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
 * Bulk import dental EV cases after AI processing and user confirmation.
 * Creates new patients/insurance contacts as needed, then creates all cases.
 */
export const bulkImport = mutation({
  args: {
    cases: v.array(
      v.object({
        patientFirstName: v.string(),
        patientLastName: v.string(),
        patientDOB: v.optional(v.string()),
        memberId: v.string(),
        groupNumber: v.optional(v.string()),
        insuranceName: v.string(),
        planName: v.optional(v.string()),
        matchedPatientId: v.optional(v.string()),
        matchedInsuranceId: v.optional(v.string()),
        matchedProviderId: v.optional(v.string()),
        matchedPlanId: v.optional(v.string()),
        cdtCodes: v.array(v.string()),
        proposedDateOfService: v.string(),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();

    // Get default provider
    const providers = await ctx.db
      .query('providers')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    const defaultProviderId = providers[0]?._id;
    if (!defaultProviderId) {
      throw new Error('No providers found. Please add at least one provider before importing cases.');
    }

    const createdPatients = new Map<string, any>();
    const createdInsurance = new Map<string, any>();
    let importedCount = 0;
    const errors: string[] = [];

    for (const c of args.cases) {
      try {
        // Resolve patient
        let patientId = c.matchedPatientId as any;
        if (!patientId) {
          const key = `${c.patientFirstName}_${c.patientLastName}_${c.memberId}`;
          if (createdPatients.has(key)) {
            patientId = createdPatients.get(key);
          } else {
            patientId = await ctx.db.insert('patients', {
              firstName: c.patientFirstName,
              lastName: c.patientLastName,
              dateOfBirth: c.patientDOB || '1900-01-01',
              memberId: c.memberId || `AUTO-${Date.now()}`,
              groupNumber: c.groupNumber,
              userId,
              createdAt: now,
              updatedAt: now,
            });
            createdPatients.set(key, patientId);
          }
        }

        // Resolve insurance
        let insuranceId = c.matchedInsuranceId as any;
        if (!insuranceId) {
          const key = c.insuranceName.toLowerCase().trim();
          if (createdInsurance.has(key)) {
            insuranceId = createdInsurance.get(key);
          } else {
            insuranceId = await ctx.db.insert('insuranceContacts', {
              name: c.insuranceName,
              phone: '+1-800-000-0000',
              userId,
              createdAt: now,
              updatedAt: now,
            });
            createdInsurance.set(key, insuranceId);
          }
        }

        // Resolve provider
        const providerId = (c.matchedProviderId as any) || defaultProviderId;

        // Resolve dental plan (optional)
        const planId = c.matchedPlanId ? (c.matchedPlanId as any) : undefined;

        // Create dental EV case
        await ctx.db.insert('dentalCases', {
          caseNumber: generateCaseNumber(),
          patientId,
          insuranceContactId: insuranceId,
          providerId,
          planId,
          proposedDateOfService: c.proposedDateOfService,
          cdtCodes: c.cdtCodes,
          status: 'awaiting_verification',
          priority: 'medium',
          notes: c.notes,
          userId,
          createdAt: now,
          updatedAt: now,
        });

        importedCount++;
      } catch (err: any) {
        errors.push(`Row "${c.patientFirstName} ${c.patientLastName}": ${err.message}`);
      }
    }

    return {
      importedCount,
      totalAttempted: args.cases.length,
      errors,
      newPatientsCreated: createdPatients.size,
      newInsuranceCreated: createdInsurance.size,
    };
  },
});
