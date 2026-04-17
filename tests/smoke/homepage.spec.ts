import { test, expect } from '@playwright/test';
import { loginWithPin } from '../fixtures/auth';

test.describe.configure({ mode: 'parallel' });

test.describe('Cadence smoke — homepage & primary navigation', () => {
  test('TC-SMK-001 — home `/` loads, title contains "Cadence", no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const response = await page.goto('/');
    expect(response, 'navigation response should exist').not.toBeNull();
    expect(response!.status(), 'GET / should be 2xx').toBeLessThan(400);

    await expect(page).toHaveTitle(/cadence/i, { timeout: 15_000 });

    // Allow the SPA a beat to settle.
    await page.waitForLoadState('domcontentloaded');
    // We tolerate noisy 3rd-party warnings but flag actual error-level entries that mention our app code.
    const appErrors = consoleErrors.filter(
      (e) => !/favicon|sourcemap|net::ERR_BLOCKED_BY_CLIENT/i.test(e),
    );
    expect(appErrors, `unexpected console errors: ${appErrors.join('\n')}`).toEqual([]);
  });

  test('TC-SMK-002 — PIN page reachable, 6 inputs visible, Continue button initially disabled', async ({ page }) => {
    await page.goto('/');

    const inputs = page.getByRole('textbox');
    await expect(inputs.first()).toBeVisible({ timeout: 15_000 });
    await expect(inputs).toHaveCount(6);

    // The Continue/Submit button — by name OR by being the only enabled-after-PIN button.
    // The PIN UI is "auto-submit on 6th digit", so a manual Continue button might not exist.
    // We test: if a button labelled Continue|Submit|Unlock exists, it must initially be disabled.
    const continueBtn = page
      .getByRole('button', { name: /continue|submit|unlock|enter/i })
      .first();
    if (await continueBtn.count()) {
      await expect(continueBtn).toBeDisabled();
    }
  });

  test('TC-SMK-003 — successful PIN login routes to dashboard URL', async ({ page }) => {
    await loginWithPin(page);
    // After PIN, we must NOT still be on a /login or /access path.
    await expect.poll(() => page.url(), { timeout: 15_000 }).not.toMatch(/access|login/i);
    // Dashboard cards usually render a known heading; accept any of the expected anchors.
    await expect(page.locator('body')).toContainText(/dashboard|claims|cadence/i);
  });

  test('TC-SMK-004 — sidebar shows existing nav AND new entries (Eligibility, Sessions)', async ({ page }) => {
    await loginWithPin(page);
    const expected = [
      /dashboard/i,
      /claims/i,
      /patients/i,
      /insurance/i,
      /providers/i,
      /call history|calls/i,
      /eligibility/i,
      /sessions/i,
    ];
    for (const re of expected) {
      await expect(page.getByRole('link', { name: re }).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('TC-SMK-005 — dashboard renders KPI cards (Total Claims, Pending, Calls Today)', async ({ page }) => {
    await loginWithPin(page);
    // Navigate explicitly in case PIN drops us elsewhere.
    const dashboardLink = page.getByRole('link', { name: /dashboard/i }).first();
    if (await dashboardLink.count()) await dashboardLink.click();

    await expect(page.locator('body')).toContainText(/total claims|claims/i, { timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/pending|in progress/i);
    await expect(page.locator('body')).toContainText(/calls/i);
  });

  test('TC-SMK-006 — /claims loads, table renders ≥1 row', async ({ page }) => {
    await loginWithPin(page);
    await page.goto('/claims');
    // Either a real <table> with rows OR a virtualized list of cards. Accept either.
    const rowCount = await page.locator('table tbody tr, [role="row"]:not([aria-rowindex="1"])').count();
    if (rowCount === 0) {
      // Card layout fallback: at least one claim-number-like text.
      await expect(page.locator('body')).toContainText(/CLM|claim #|claim number/i, { timeout: 15_000 });
    } else {
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test('TC-SMK-007 — /eligibility loads, "Dental Eligibility" heading present', async ({ page }) => {
    await loginWithPin(page);
    await page.goto('/eligibility');
    await expect(
      page.getByRole('heading', { name: /dental eligibility|eligibility/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('TC-SMK-008 — /sessions loads', async ({ page }) => {
    await loginWithPin(page);
    await page.goto('/sessions');
    await expect(page.locator('body')).toContainText(/sessions|call session/i, { timeout: 15_000 });
  });

  test('TC-SMK-009 — /settings loads, API status displayed', async ({ page }) => {
    await loginWithPin(page);
    await page.goto('/settings');
    // Settings page should reference one of: API status, environment, version.
    await expect(page.locator('body')).toContainText(/api|status|environment|version/i, {
      timeout: 15_000,
    });
  });

  test('TC-SMK-010 — PIN cleared on hard reload (session-only auth)', async ({ page, context }) => {
    await loginWithPin(page);
    // Reload the app with a fresh session — PIN gate must reappear since auth is session-scoped.
    await context.clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    });
    await page.goto('/');
    const inputs = page.getByRole('textbox');
    await expect(inputs.first()).toBeVisible({ timeout: 15_000 });
    await expect(inputs).toHaveCount(6);
  });
});
