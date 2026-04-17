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

test.describe('Sessions — page render', () => {
  test('TC-SESS-UI-001 — sidebar Sessions link visible & clicking navigates to /sessions', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    const link = loggedInPage.getByRole('link', { name: /^sessions$/i }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect.poll(() => loggedInPage.url(), { timeout: 10_000 }).toMatch(/\/sessions$/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-002 — page heading "Sessions" visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await expect(
      loggedInPage.getByRole('heading', { name: /^sessions$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-003 — "New Session" button visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await expect(
      loggedInPage.getByRole('button', { name: /new session/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-004 — table headers Session #, Payer, Use Case, Items, Status, Aggregate Outcome, Created', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    const headers = ['Session #', 'Payer', 'Use Case', 'Items', 'Status', 'Aggregate Outcome', 'Created'];
    for (const h of headers) {
      await expect(
        loggedInPage.locator('thead').getByText(h, { exact: false }).first(),
      ).toBeVisible({ timeout: 15_000 });
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-005 — empty-state OR rows render based on session count', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const rows = await loggedInPage.locator('table tbody tr').count();
    const empty = await loggedInPage.getByText(/no sessions yet/i).count();
    expect(rows > 0 || empty > 0).toBe(true);
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-006 — clicking "New Session" opens wizard modal', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await loggedInPage.getByRole('button', { name: /new session/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-007 — wizard modal shows step indicator (Payer/Items/Confirm)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await loggedInPage.getByRole('button', { name: /new session/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    for (const label of [/payer/i, /items/i, /confirm/i]) {
      await expect(dialog.getByText(label).first()).toBeVisible({ timeout: 10_000 });
    }
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-008 — wizard exposes use-case choices (Claim Follow-up, Dental EV)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await loggedInPage.getByRole('button', { name: /new session/i }).first().click();
    const dialog = loggedInPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/claim follow-?up/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog.getByText(/dental .* verification|dental ev/i).first()).toBeVisible(
      { timeout: 10_000 },
    );
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-009 — page survives refresh & remains on /sessions', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await loggedInPage.reload();
    await expect.poll(() => loggedInPage.url(), { timeout: 15_000 }).toMatch(/\/sessions$/);
    expect(getErrors()).toEqual([]);
  });

  test('TC-SESS-UI-010 — zero console errors on /sessions load', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/sessions');
    await loggedInPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    expect(getErrors()).toEqual([]);
  });
});
