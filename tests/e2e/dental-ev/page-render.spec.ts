import { test, expect } from '../../fixtures/auth';

test.describe.configure({ mode: 'parallel' });

/**
 * Helper: set up console error tracking.
 * Returns a getter that filters out known third-party noise.
 */
function trackConsoleErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return () =>
    errors.filter(
      (e) =>
        !/favicon|sourcemap|net::ERR_BLOCKED_BY_CLIENT|expected ignorable|websocket/i.test(e),
    );
}

test.describe('Dental Eligibility — page render', () => {
  test('TC-DENTAL-UI-001 — sidebar shows Eligibility link', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await expect(
      loggedInPage.getByRole('link', { name: /eligibility/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-002 — clicking sidebar Eligibility navigates to /eligibility', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.getByRole('link', { name: /eligibility/i }).first().click();
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/eligibility$/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-003 — page heading "Dental Eligibility" visible', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await expect(
      loggedInPage.getByRole('heading', { name: /dental eligibility/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-004 — "Add Case" button visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await expect(
      loggedInPage.getByRole('button', { name: /add case/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-005 — "Import Cases" button visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await expect(
      loggedInPage.getByRole('button', { name: /import cases/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-006 — status filter dropdown visible (contains "All Statuses")', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    // Status filter is a <select> with "All Statuses" as the default option.
    await expect(
      loggedInPage.locator('select', { hasText: 'All Statuses' }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-007 — payer filter dropdown visible (contains "All Payers")', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await expect(
      loggedInPage.locator('select', { hasText: 'All Payers' }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-008 — DOS date range filter (2 date inputs) visible', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    const dateInputs = loggedInPage.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible({ timeout: 15_000 });
    await expect(dateInputs).toHaveCount(2);
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-009 — search input visible with placeholder', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await expect(
      loggedInPage.getByPlaceholder(/search case .* patient/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-010 — table headers Case#, Patient, Payer, Plan, CDT Codes, DOS, Status', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    const headers = ['Case #', 'Patient', 'Payer', 'Plan', 'CDT Codes', 'DOS', 'Status'];
    for (const h of headers) {
      await expect(
        loggedInPage.locator('thead').getByText(h, { exact: false }).first(),
      ).toBeVisible({ timeout: 15_000 });
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-011 — empty-state OR table rows render based on case count', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    // Wait for either rows OR the empty state to appear (loading shimmer resolves).
    await loggedInPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const bodyRows = loggedInPage.locator('table tbody tr');
    const emptyState = loggedInPage.getByText(/no dental ev cases found/i);
    const rowCount = await bodyRows.count();
    const hasEmpty = await emptyState.count();
    expect(rowCount > 0 || hasEmpty > 0).toBe(true);
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-012 — clicking "Add Case" opens modal', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.getByRole('button', { name: /add case/i }).first().click();
    // Modal opens; check for any of the modal-only labels (CDT, Patient, etc.) in a dialog.
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-013 — Add Case modal exposes form fields (patient, plan, insurance, provider, DOS, CDT)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.getByRole('button', { name: /add case/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Field labels (uppercase text in the modal).
    for (const label of [/patient/i, /plan/i, /insurance|payer/i, /provider/i, /dos|date of service/i, /cdt/i]) {
      await expect(dialog.getByText(label).first()).toBeVisible({ timeout: 10_000 });
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-014 — Add Case modal Cancel button closes it', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.getByRole('button', { name: /add case/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /cancel/i }).first().click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-015 — Add Case modal validates required fields on submit', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.getByRole('button', { name: /add case/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Try to submit without filling — expect either dialog stays open OR an error/required
    // indicator appears. We assert the dialog has NOT closed (validation blocked submit).
    const submitBtn = dialog
      .getByRole('button', { name: /create|save|add|submit/i })
      .last();
    if (await submitBtn.count()) {
      await submitBtn.click().catch(() => {});
    }
    // After invalid submit, dialog must still be visible (validation blocked it).
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-016 — clicking "Import Cases" opens import modal', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.getByRole('button', { name: /import cases/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-017 — import modal accepts a file via dropzone or file input', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.getByRole('button', { name: /import cases/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Dropzone OR <input type="file"> must be present.
    const fileInput = dialog.locator('input[type="file"]');
    const dropZone = dialog.getByText(/drop your .* file|click to browse/i);
    const hasFileMechanism = (await fileInput.count()) + (await dropZone.count());
    expect(hasFileMechanism).toBeGreaterThan(0);
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-018 — selecting a status filter does not crash & filter sticks', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    const statusSelect = loggedInPage.locator('select', { hasText: 'All Statuses' }).first();
    await expect(statusSelect).toBeVisible({ timeout: 15_000 });
    await statusSelect.selectOption({ value: 'verified' });
    await expect(statusSelect).toHaveValue('verified');
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-019 — selecting a payer filter does not crash & filter sticks', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    const payerSelect = loggedInPage.locator('select', { hasText: 'All Payers' }).first();
    await expect(payerSelect).toBeVisible({ timeout: 15_000 });
    // Pick the second option (first is "All Payers"), if any payers loaded.
    const optionValues = await payerSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    if (optionValues.length > 1) {
      await payerSelect.selectOption({ value: optionValues[1] });
      await expect(payerSelect).toHaveValue(optionValues[1]);
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-020 — search box accepts text without crashing', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    const search = loggedInPage.getByPlaceholder(/search case .* patient/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('Smith');
    await expect(search).toHaveValue('Smith');
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-021 — zero console errors on initial /eligibility load', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-022 — browser back/forward navigation between / and /eligibility works', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await loggedInPage.goto('/eligibility');
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/eligibility$/);
    await loggedInPage.goBack();
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/$|\/dashboard/);
    await loggedInPage.goForward();
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/eligibility$/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-023 — page survives refresh (PIN auth persists in session, still on /eligibility)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await loggedInPage.reload();
    await expect.poll(() => loggedInPage.url(), { timeout: 15_000 }).toMatch(/\/eligibility$/);
    await expect(
      loggedInPage.getByRole('heading', { name: /dental eligibility/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-024 — sidebar Eligibility entry has active style on this page', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    const link = loggedInPage.getByRole('link', { name: /eligibility/i }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    // Active NavLink uses text-accent class. Just check the class string contains "accent".
    const cls = (await link.getAttribute('class')) ?? '';
    expect(cls).toMatch(/accent/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-DENTAL-UI-025 — footer/version v0.1.0 still visible from sidebar', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/eligibility');
    await expect(loggedInPage.getByText(/v0\.1\.0/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });
});
