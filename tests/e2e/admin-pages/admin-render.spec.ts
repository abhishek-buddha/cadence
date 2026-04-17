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

/**
 * The admin nav cluster is rendered conditionally based on AuthContext role.
 * AuthContext is hardcoded to 'admin' in the demo build, so all admin links
 * (Audit Log, Users, API Keys, Webhooks) and Transfers should be reachable.
 */

test.describe('Admin pages — render', () => {
  test('TC-ADM-001 — /audit loads & "Audit Log" heading visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/audit');
    await expect(
      loggedInPage.getByRole('heading', { name: /audit log/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-002 — sidebar Audit Log entry present (admin role)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('link', { name: /audit log/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-003 — /users loads & "Users" heading visible', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/users');
    await expect(
      loggedInPage.getByRole('heading', { name: /^users$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-004 — sidebar Users entry present (admin role)', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('link', { name: /^users$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-005 — /api-keys loads & references API keys', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/api-keys');
    await expect(
      loggedInPage.getByRole('heading', { name: /api keys/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-006 — sidebar API Keys entry present (admin role)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('link', { name: /api keys/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-007 — /webhooks loads & "Webhooks" heading visible', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/webhooks');
    await expect(
      loggedInPage.getByRole('heading', { name: /webhooks/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-008 — sidebar Webhooks entry present (admin/manager role)', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('link', { name: /webhooks/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-009 — /transfers loads & references transfer destinations', async ({
    loggedInPage,
  }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/transfers');
    await expect(
      loggedInPage.getByRole('heading', { name: /transfer/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });

  test('TC-ADM-010 — sidebar Transfers entry present', async ({ loggedInPage }) => {
    const getErrors = trackConsoleErrors(loggedInPage);
    await loggedInPage.goto('/');
    await expect(
      loggedInPage.getByRole('link', { name: /^transfers$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getErrors()).toEqual([]);
  });
});
