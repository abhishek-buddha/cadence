import { test, expect } from '@playwright/test';
import {
  classifyMedicalCallOutcome,
  MEDICAL_REQUIRED_FIELDS,
  failedFromCallStatus,
} from '../../convex/outcomeClassifier';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __FIX_DIR = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => JSON.parse(readFileSync(resolve(__FIX_DIR, '../fixtures/transcripts', name), 'utf8'));
const medicalPaidFull = fx('medical-paid-full.json');
const medicalDeniedCo45 = fx('medical-denied-co45.json');
const medicalPending = fx('medical-pending.json');
const medicalPartial = fx('medical-partial.json');
const medicalVoicemail = fx('medical-voicemail.json');

/**
 * Outcome classification — medical claim status calls.
 *
 * Tests the pure classifier `classifyMedicalCallOutcome(callResult, callStatus?)`.
 * The classifier is policy-driven by `MEDICAL_REQUIRED_FIELDS[claimStatus]`:
 *   - paid    → claimStatus, paidAmount, paidDate, checkOrEftNumber, referenceNumber, repName
 *   - denied  → claimStatus, denialCode, denialReason, appealDeadline, referenceNumber, repName
 *   - pending → claimStatus, expectedDecisionDate, referenceNumber, repName
 *
 * Outcome thresholds: 100% retrieved → "successful", ≥50% → "partial", <50% → "failed".
 * Call-status short-circuit: voicemail/no_answer/ivr_only/error/abandoned/busy → "failed".
 *
 * Each test mirrors the structure of the golden fixtures (id, useCase, etc.) so the
 * fixture metadata is asserted alongside the synthesized callResult shape that the
 * classifier consumes (the fixture's `expectedExtraction` is the GPT-extraction
 * surface; the classifier sees the canonical callResult schema).
 */

test.describe.configure({ mode: 'parallel' });

test.describe('TC-OUT-CLS — medical outcome classification', () => {
  test('TC-OUT-CLS-001 — medical-paid-full fixture → successful, all 6 fields retrieved', async () => {
    expect(medicalPaidFull.id).toBe('medical-paid-full');
    const callResult = {
      claimStatus: 'paid',
      paidAmount: 365000, // cents
      paidDate: '2026-04-05',
      checkOrEftNumber: 'CHK7728193',
      referenceNumber: 'REF-PAID-001',
      repName: 'Janet',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('successful');
    expect(result.requiredFieldsRetrieved.sort()).toEqual([...MEDICAL_REQUIRED_FIELDS.paid].sort());
    expect(result.missingFields).toEqual([]);
    expect(result.reason).toMatch(/All 6 required fields retrieved/);
  });

  test('TC-OUT-CLS-002 — medical-denied-co45 fixture → successful, all denied fields', async () => {
    expect(medicalDeniedCo45.id).toBe('medical-denied-co45');
    const callResult = {
      claimStatus: 'denied',
      denialCode: 'CO-45',
      denialReason: 'charge exceeds fee schedule maximum allowable',
      appealDeadline: '2026-05-17',
      referenceNumber: 'ICN-77382910023',
      repName: 'Marcus',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('successful');
    expect(result.requiredFieldsRetrieved.sort()).toEqual([...MEDICAL_REQUIRED_FIELDS.denied].sort());
    expect(result.missingFields).toEqual([]);
  });

  test('TC-OUT-CLS-003 — medical-pending fixture → successful, all pending fields', async () => {
    expect(medicalPending.id).toBe('medical-pending');
    const callResult = {
      claimStatus: 'pending',
      expectedDecisionDate: '2026-04-23',
      referenceNumber: 'REQ-7728192',
      repName: 'Patricia',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('successful');
    expect(result.requiredFieldsRetrieved.sort()).toEqual([...MEDICAL_REQUIRED_FIELDS.pending].sort());
    expect(result.missingFields).toEqual([]);
  });

  test('TC-OUT-CLS-004 — medical-partial fixture (paid status, missing payment fields) → partial', async () => {
    expect(medicalPartial.id).toBe('medical-partial');
    const callResult = {
      claimStatus: 'paid',
      // paidAmount, paidDate, checkOrEftNumber missing — rep refused to disclose
      referenceNumber: 'REF-PARTIAL-004',
      repName: 'Robert',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.requiredFieldsRetrieved).toContain('claimStatus');
    expect(result.requiredFieldsRetrieved).toContain('referenceNumber');
    expect(result.requiredFieldsRetrieved).toContain('repName');
    expect(result.missingFields).toEqual(
      expect.arrayContaining(['paidAmount', 'paidDate', 'checkOrEftNumber']),
    );
    expect(result.reason).toMatch(/3\/6 required fields/);
  });

  test('TC-OUT-CLS-005 — medical-voicemail fixture → failed (call status short-circuit)', async () => {
    expect(medicalVoicemail.id).toBe('medical-voicemail');
    // Even with a fully populated callResult, voicemail status forces "failed".
    const callResult = {
      claimStatus: 'paid',
      paidAmount: 100000,
      paidDate: '2026-04-05',
      checkOrEftNumber: 'CHK999',
      referenceNumber: 'REF999',
      repName: 'Janet',
    };
    const result = classifyMedicalCallOutcome(callResult, 'voicemail');
    expect(result.outcome).toBe('failed');
    expect(result.requiredFieldsRetrieved).toEqual([]);
    expect(result.missingFields).toEqual([]);
    expect(result.reason).toMatch(/voicemail/);
  });

  test('TC-OUT-CLS-006 — paid call missing checkOrEftNumber → partial', async () => {
    const callResult = {
      claimStatus: 'paid',
      paidAmount: 250000,
      paidDate: '2026-04-01',
      // checkOrEftNumber missing
      referenceNumber: 'REF-006',
      repName: 'Alice',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['checkOrEftNumber']);
    expect(result.requiredFieldsRetrieved).toHaveLength(5);
  });

  test('TC-OUT-CLS-007 — paid call missing paidDate → partial', async () => {
    const callResult = {
      claimStatus: 'paid',
      paidAmount: 250000,
      // paidDate missing
      checkOrEftNumber: 'CHK-007',
      referenceNumber: 'REF-007',
      repName: 'Bob',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['paidDate']);
    expect(result.requiredFieldsRetrieved).toHaveLength(5);
  });

  test('TC-OUT-CLS-008 — denied call missing appealDeadline → partial', async () => {
    const callResult = {
      claimStatus: 'denied',
      denialCode: 'CO-50',
      denialReason: 'These are non-covered services because this is not deemed a medical necessity',
      // appealDeadline missing
      referenceNumber: 'REF-008',
      repName: 'Carol',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    expect(result.outcome).toBe('partial');
    expect(result.missingFields).toEqual(['appealDeadline']);
    expect(result.requiredFieldsRetrieved).toHaveLength(5);
  });

  test('TC-OUT-CLS-009 — status="voicemail" with fully populated callResult → failed (short-circuit)', async () => {
    const callResult = {
      claimStatus: 'paid',
      paidAmount: 999900,
      paidDate: '2026-04-10',
      checkOrEftNumber: 'CHK-FULL',
      referenceNumber: 'REF-FULL',
      repName: 'Dave',
    };
    expect(failedFromCallStatus('voicemail')).toBe(true);
    const result = classifyMedicalCallOutcome(callResult, 'voicemail');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/voicemail/);
  });

  test('TC-OUT-CLS-010 — status="no_answer" → failed (short-circuit, no required-field eval)', async () => {
    expect(failedFromCallStatus('no_answer')).toBe(true);
    const result = classifyMedicalCallOutcome(null, 'no_answer');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/no_answer/);
  });

  test('TC-OUT-CLS-011 — status="ivr_only" → failed (call never reached a rep)', async () => {
    expect(failedFromCallStatus('ivr_only')).toBe(true);
    const result = classifyMedicalCallOutcome({ claimStatus: 'paid' }, 'ivr_only');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/ivr_only/);
  });

  test('TC-OUT-CLS-012 — status="error" → failed', async () => {
    expect(failedFromCallStatus('error')).toBe(true);
    const result = classifyMedicalCallOutcome({}, 'error');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/error/);
  });

  test('TC-OUT-CLS-013 — status="busy" → failed', async () => {
    expect(failedFromCallStatus('busy')).toBe(true);
    const result = classifyMedicalCallOutcome({ claimStatus: 'pending' }, 'busy');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/busy/);
  });

  test('TC-OUT-CLS-014 — unknown claimStatus value → graceful partial classification, no crash', async () => {
    const callResult = {
      claimStatus: 'rejected_for_review', // not in MEDICAL_REQUIRED_FIELDS map
      referenceNumber: 'REF-014',
      repName: 'Eve',
    };
    const result = classifyMedicalCallOutcome(callResult, 'completed');
    // Unknown status with a non-empty value → partial, capturing claimStatus only
    expect(result.outcome).toBe('partial');
    expect(result.requiredFieldsRetrieved).toEqual(['claimStatus']);
    expect(result.missingFields).toEqual([]);
    expect(result.reason).toMatch(/no defined required field set|partial/);
  });

  test('TC-OUT-CLS-015 — null callResult (no body returned) → failed gracefully, no crash', async () => {
    const result = classifyMedicalCallOutcome(null, 'completed');
    expect(result.outcome).toBe('failed');
    expect(result.requiredFieldsRetrieved).toEqual([]);
    expect(result.reason).toMatch(/No call result data/);

    // undefined behaves identically to null
    const result2 = classifyMedicalCallOutcome(undefined, 'completed');
    expect(result2.outcome).toBe('failed');

    // empty object with no claimStatus → "No claim status determined"
    const result3 = classifyMedicalCallOutcome({}, 'completed');
    expect(result3.outcome).toBe('failed');
    expect(result3.missingFields).toEqual(['claimStatus']);
  });
});
