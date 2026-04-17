import { test, expect } from '../../fixtures/auth';

test.describe.configure({ mode: 'parallel' });

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

test.describe('Claims — page render', () => {
  test('TC-CLM-UI-001 — sidebar Claims link navigates to /claims', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.getByRole('link', { name: /^claims$/i }).first().click();
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/claims$/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-002 — page heading "Claims" visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await expect(
      loggedInPage.getByRole('heading', { name: /^claims$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-003 — table headers Claim #, CPT Code, Insurance, Amount, Status, Latest Update', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    for (const h of ['Claim #', 'CPT Code', 'Insurance', 'Amount', 'Status', 'Latest Update']) {
      await expect(
        loggedInPage.locator('thead').getByText(h, { exact: false }).first(),
      ).toBeVisible({ timeout: 15_000 });
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-004 — empty-state OR rows render based on claim count', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const rows = await loggedInPage.locator('table tbody tr').count();
    const empty = await loggedInPage.getByText(/no claims found/i).count();
    expect(rows > 0 || empty > 0).toBe(true);
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-005 — status filter dropdown visible (contains "All Statuses")', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await expect(
      loggedInPage.locator('select', { hasText: 'All Statuses' }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-006 — search input visible with claims placeholder', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await expect(
      loggedInPage.getByPlaceholder(/search claims/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-007 — "Add Claim" button visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await expect(
      loggedInPage.getByRole('button', { name: /add claim/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-008 — "Upload Claims" button visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await expect(
      loggedInPage.getByRole('button', { name: /upload claims/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-009 — clicking a row navigates to /claims/:id (if any rows exist)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const rows = loggedInPage.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No claim rows available to click; table is in empty state.',
      });
      return;
    }
    // Click on a non-checkbox cell — pick the claim-number cell.
    await rows
      .first()
      .locator('td')
      .nth(1)
      .click({ force: true });
    await expect
      .poll(() => loggedInPage.url(), { timeout: 10_000 })
      .toMatch(/\/claims\/[^/]+$/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-CLM-UI-010 — zero console errors on /claims load', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/claims');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    expect(getErrors()).toEqual([]);
  });
});
