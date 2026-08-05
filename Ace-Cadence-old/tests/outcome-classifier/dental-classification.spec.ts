import { test, expect } from '@playwright/test';
import {
  classifyDentalCallOutcome,
  DENTAL_EV_REQUIRED_BASE,
  DENTAL_EV_REQUIRED_IF_ACTIVE,
} from '../../convex/outcomeClassifier';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __FIX_DIR = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => JSON.parse(readFileSync(resolve(__FIX_DIR, '../fixtures/transcripts', name), 'utf8'));
const dentalActive = fx('dental-active.json');
const dentalInactive = fx('dental-inactive.json');
const dentalPartial = fx('dental-partial.json');

/**
 * Outcome classification — dental eligibility verification calls.
 *
 * Required base fields (always): isActive, referenceNumber, repName.
 * If isActive === true, additional fields required:
 *   deductibleAnnualCents, deductibleMetCents, annualMaximumCents,
 *   annualMaxRemainingCents, networkStatus, coinsurancePct.
 *
 * Threshold rule identical to medical: 100% → successful, ≥50% → partial, <50% → failed.
 *
 * Special-case: isActive=false counts as a *retrieved* value (we did learn the policy
 * is inactive); only the 3 base fields are required in that case.
 */

test.describe.configure({ mode: 'parallel' });

test.describe('TC-OUT-CLS-D — dental EV outcome classification', () => {
  test('TC-OUT-CLS-D-001 — dental-active fixture → successful, all base + ifActive fields', async () => {
    expect(dentalActive.id).toBe('dental-active');
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-001',
      repName: 'Linda',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 0,
      annualMaximumCents: 200000,
      annualMaxRemainingCents: 200000,
      networkStatus: 'IN_NETWORK',
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('successful');
    const expected = [...DENTAL_EV_REQUIRED_BASE, ...DENTAL_EV_REQUIRED_IF_ACTIVE].sort();
    expect(result.requiredFieldsRetrieved.sort()).toEqual(expected);
    expect(result.missingFields).toEqual([]);
  });

  test('TC-OUT-CLS-D-002 — dental-inactive fixture → successful (only 3 base fields required)', async () => {
    expect(dentalInactive.id).toBe('dental-inactive');
    const evResult = {
      isActive: false,
      referenceNumber: 'REF-DEN-002',
      repName: 'Tom',
      // No coverage details required when isActive=false
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('successful');
    expect(result.requiredFieldsRetrieved.sort()).toEqual([...DENTAL_EV_REQUIRED_BASE].sort());
    expect(result.missingFields).toEqual([]);
    expect(result.reason).toMatch(/All 3 required fields/);
  });

  test('TC-OUT-CLS-D-003 — dental-partial fixture (isActive but missing several coverage fields) → partial', async () => {
    expect(dentalPartial.id).toBe('dental-partial');
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-003',
      repName: 'Susan',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 5000,
      annualMaximumCents: 200000,
      annualMaxRemainingCents: 150000,
      networkStatus: 'IN_NETWORK',
      // coinsurancePct missing — rep refused to share specifics
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    // 8/9 retrieved → partial (≥50% threshold)
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['coinsurancePct']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-004 — active EV missing deductibleAnnualCents → partial', async () => {
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-004',
      repName: 'Anna',
      // deductibleAnnualCents missing
      deductibleMetCents: 0,
      annualMaximumCents: 150000,
      annualMaxRemainingCents: 150000,
      networkStatus: 'IN_NETWORK',
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['deductibleAnnualCents']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-005 — active EV missing deductibleMetCents → partial', async () => {
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-005',
      repName: 'Brian',
      deductibleAnnualCents: 5000,
      // deductibleMetCents missing
      annualMaximumCents: 150000,
      annualMaxRemainingCents: 150000,
      networkStatus: 'IN_NETWORK',
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['deductibleMetCents']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-006 — active EV missing annualMaximumCents → partial', async () => {
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-006',
      repName: 'Cara',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 0,
      // annualMaximumCents missing
      annualMaxRemainingCents: 150000,
      networkStatus: 'IN_NETWORK',
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['annualMaximumCents']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-007 — active EV missing annualMaxRemainingCents → partial', async () => {
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-007',
      repName: 'David',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 0,
      annualMaximumCents: 150000,
      // annualMaxRemainingCents missing
      networkStatus: 'IN_NETWORK',
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['annualMaxRemainingCents']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-008 — active EV missing networkStatus → partial', async () => {
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-008',
      repName: 'Erin',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 0,
      annualMaximumCents: 150000,
      annualMaxRemainingCents: 150000,
      // networkStatus missing
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['networkStatus']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-009 — active EV missing coinsurancePct → partial', async () => {
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-009',
      repName: 'Frank',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 0,
      annualMaximumCents: 150000,
      annualMaxRemainingCents: 150000,
      networkStatus: 'IN_NETWORK',
      // coinsurancePct missing
    };
    const result = classifyDentalCallOutcome(evResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['coinsurancePct']);
    expect(result.requiredFieldsRetrieved).toHaveLength(8);
  });

  test('TC-OUT-CLS-D-010 — call short-circuit (voicemail) on a dental EV → failed', async () => {
    // Even with full data, voicemail status forces failed.
    const evResult = {
      isActive: true,
      referenceNumber: 'REF-DEN-010',
      repName: 'Gina',
      deductibleAnnualCents: 5000,
      deductibleMetCents: 0,
      annualMaximumCents: 150000,
      annualMaxRemainingCents: 150000,
      networkStatus: 'IN_NETWORK',
      coinsurancePct: 80,
    };
    const result = classifyDentalCallOutcome(evResult, 'voicemail');
    expect(result.outcome).toBe('failed');
    expect(result.requiredFieldsRetrieved).toEqual([]);
    expect(result.reason).toMatch(/voicemail/);

    // Null evResult also fails gracefully
    const result2 = classifyDentalCallOutcome(null, 'completed');
    expect(result2.outcome).toBe('failed');
    expect(result2.reason).toMatch(/No EV result data/);
  });
});
