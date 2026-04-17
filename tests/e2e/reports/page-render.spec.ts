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

test.describe('Reports — page render', () => {
  test('TC-RPT-UI-001 — sidebar Reports link navigates to /reports', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.getByRole('link', { name: /reports/i }).first().click();
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/reports$/);
    await expect(
      loggedInPage.getByRole('heading', { name: /reports/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-002 — five tabs visible (Success Rate, Data Accuracy, Turnaround Time, Exception Report, Volume by Tier)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    for (const label of [
      /success rate/i,
      /data accuracy/i,
      /turnaround time/i,
      /exception report/i,
      /volume by tier/i,
    ]) {
      await expect(
        loggedInPage.getByRole('button', { name: label }).first(),
      ).toBeVisible({ timeout: 15_000 });
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-003 — clicking Data Accuracy tab updates content', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    await loggedInPage.getByRole('button', { name: /data accuracy/i }).first().click();
    await expect(
      loggedInPage.getByText(/avg field capture rate|field capture rate/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-004 — clicking Turnaround Time tab updates content', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    await loggedInPage.getByRole('button', { name: /turnaround time/i }).first().click();
    await expect(
      loggedInPage.getByText(/call duration distribution|avg duration/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-005 — clicking Exception Report tab updates content', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    await loggedInPage.getByRole('button', { name: /exception report/i }).first().click();
    await expect(
      loggedInPage.getByText(/exceptions by reason|recent exceptions/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-006 — clicking Volume by Tier tab updates content', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    await loggedInPage.getByRole('button', { name: /volume by tier/i }).first().click();
    await expect(
      loggedInPage.getByText(/call volume by tier/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-007 — clicking back to Success Rate tab restores content', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    await loggedInPage.getByRole('button', { name: /data accuracy/i }).first().click();
    await loggedInPage.getByRole('button', { name: /success rate/i }).first().click();
    await expect(
      loggedInPage.getByText(/success rate by payer|overall success rate/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-008 — filter bar visible (date range, payer select, useCase select)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    const dateInputs = loggedInPage.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible({ timeout: 15_000 });
    expect(await dateInputs.count()).toBeGreaterThanOrEqual(2);
    await expect(
      loggedInPage.locator('select', { hasText: 'All Payers' }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      loggedInPage.locator('select', { hasText: 'All Use Cases' }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-009 — at least one "Export CSV" button visible (per active tab)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    // Default tab is Success Rate, which has an Export CSV action button on the bar chart card.
    await expect(
      loggedInPage.getByRole('button', { name: /export csv/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-RPT-UI-010 — zero console errors on /reports load', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/reports');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    expect(getErrors()).toEqual([]);
  });
});
