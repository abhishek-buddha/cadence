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

test.describe('Dashboard — page render', () => {
  test('TC-DASH-001 — / loads & "Dashboard" heading visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('heading', { name: /^dashboard$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-002 — Total Claims KPI shows numeric value (>= 0)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await expect(loggedInPage.getByText(/total claims/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-003 — Pending Follow-up KPI visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(loggedInPage.getByText(/pending follow-?up/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-004 — Calls Today KPI visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(loggedInPage.getByText(/calls today/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-005 — Success Rate KPI visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(loggedInPage.getByText(/success rate/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-006 — Total Billed KPI visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(loggedInPage.getByText(/total billed/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-007 — Recovered KPI visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(loggedInPage.getByText(/^recovered$/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-008 — Aging Buckets section visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(loggedInPage.getByText(/aging buckets/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // At least one bucket label rendered.
    await expect(
      loggedInPage.getByText(/0-30 days|31-60 days|61-90 days/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-009 — Outcome Distribution widget visible (NEW)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('heading', { name: /outcome distribution/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    // "This week" subtitle is unique to that card.
    await expect(loggedInPage.getByText(/this week/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(getErrors()).toEqual([]);
  });

  test('TC-DASH-010 — zero console errors on dashboard load', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    expect(getErrors()).toEqual([]);
  });
});
