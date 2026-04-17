// Outcome classification: 100% required-field retrieval = "successful" (RFP requirement).
// Pure functions — no Convex imports. Used by transcript analyzers and call result handlers.

// Required fields per medical claim status. Always-required fields apply regardless of status.
export const MEDICAL_REQUIRED_FIELDS = {
  paid: ['claimStatus', 'paidAmount', 'paidDate', 'checkOrEftNumber', 'referenceNumber', 'repName'],
  denied: ['claimStatus', 'denialCode', 'denialReason', 'appealDeadline', 'referenceNumber', 'repName'],
  pending: ['claimStatus', 'expectedDecisionDate', 'referenceNumber', 'repName'],
  processing: ['claimStatus', 'expectedDecisionDate', 'referenceNumber', 'repName'],
  appealing: ['claimStatus', 'expectedDecisionDate', 'referenceNumber', 'repName'],
} as const;

// Dental EV: base fields always required. If isActive, full coverage details required.
export const DENTAL_EV_REQUIRED_BASE = ['isActive', 'referenceNumber', 'repName'];
export const DENTAL_EV_REQUIRED_IF_ACTIVE = [
  'deductibleAnnualCents',
  'deductibleMetCents',
  'annualMaximumCents',
  'annualMaxRemainingCents',
  'networkStatus',
  'coinsurancePct',
];

// Call statuses indicating the call itself didn't reach a rep — short-circuit to "failed"
export const FAILED_CALL_STATUSES = ['voicemail', 'no_answer', 'ivr_only', 'error', 'abandoned', 'busy'];

export function failedFromCallStatus(callStatus: string | null | undefined): boolean {
  if (!callStatus) return false;
  return FAILED_CALL_STATUSES.includes(callStatus);
}

export type ClassificationResult = {
  outcome: 'successful' | 'partial' | 'failed';
  requiredFieldsRetrieved: string[];
  missingFields: string[];
  reason: string;
};

// Treat null, undefined, and empty/whitespace strings as missing
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

function classifyByThreshold(
  retrieved: string[],
  missing: string[],
  total: number,
  contextLabel: string,
): ClassificationResult {
  if (missing.length === 0) {
    return {
      outcome: 'successful',
      requiredFieldsRetrieved: retrieved,
      missingFields: [],
      reason: `All ${total} required fields retrieved for ${contextLabel}`,
    };
  }
  // 50%+ retrieved → partial; less → failed
  const ratio = retrieved.length / total;
  if (ratio >= 0.5) {
    return {
      outcome: 'partial',
      requiredFieldsRetrieved: retrieved,
      missingFields: missing,
      reason: `${retrieved.length}/${total} required fields retrieved for ${contextLabel}; missing: ${missing.join(', ')}`,
    };
  }
  return {
    outcome: 'failed',
    requiredFieldsRetrieved: retrieved,
    missingFields: missing,
    reason: `Only ${retrieved.length}/${total} required fields retrieved for ${contextLabel}`,
  };
}

export function classifyMedicalCallOutcome(
  callResult: Record<string, unknown> | null | undefined,
  callStatus?: string | null,
): ClassificationResult {
  if (failedFromCallStatus(callStatus)) {
    return {
      outcome: 'failed',
      requiredFieldsRetrieved: [],
      missingFields: [],
      reason: `Call did not reach a rep (status: ${callStatus})`,
    };
  }
  if (!callResult) {
    return {
      outcome: 'failed',
      requiredFieldsRetrieved: [],
      missingFields: [],
      reason: 'No call result data available',
    };
  }

  const status = (callResult.claimStatus as string) ?? '';
  const required = (MEDICAL_REQUIRED_FIELDS as Record<string, readonly string[]>)[status];

  if (!required) {
    const has = hasValue(callResult.claimStatus);
    return {
      outcome: has ? 'partial' : 'failed',
      requiredFieldsRetrieved: has ? ['claimStatus'] : [],
      missingFields: has ? [] : ['claimStatus'],
      reason: has
        ? `Claim status "${status}" has no defined required field set; partial classification`
        : 'No claim status determined',
    };
  }

  const retrieved: string[] = [];
  const missing: string[] = [];
  for (const field of required) {
    if (hasValue(callResult[field])) retrieved.push(field);
    else missing.push(field);
  }
  return classifyByThreshold(retrieved, missing, required.length, `status "${status}"`);
}

export function classifyDentalCallOutcome(
  evResult: Record<string, unknown> | null | undefined,
  callStatus?: string | null,
): ClassificationResult {
  if (failedFromCallStatus(callStatus)) {
    return {
      outcome: 'failed',
      requiredFieldsRetrieved: [],
      missingFields: [],
      reason: `Call did not reach a rep (status: ${callStatus})`,
    };
  }
  if (!evResult) {
    return {
      outcome: 'failed',
      requiredFieldsRetrieved: [],
      missingFields: [],
      reason: 'No EV result data available',
    };
  }

  const isActive = evResult.isActive;
  const required = [...DENTAL_EV_REQUIRED_BASE];
  if (isActive === true) required.push(...DENTAL_EV_REQUIRED_IF_ACTIVE);

  const retrieved: string[] = [];
  const missing: string[] = [];
  for (const field of required) {
    // For boolean isActive, false is also a valid retrieved value
    if (field === 'isActive') {
      if (isActive === true || isActive === false) retrieved.push(field);
      else missing.push(field);
      continue;
    }
    if (hasValue(evResult[field])) retrieved.push(field);
    else missing.push(field);
  }
  return classifyByThreshold(retrieved, missing, required.length, 'dental EV');
}
