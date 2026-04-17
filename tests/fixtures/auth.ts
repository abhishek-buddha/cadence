import { test as base, expect, Page } from '@playwright/test';

/**
 * Logs in via the 6-digit PIN gate on AccessCodePage.
 * The PIN auto-submits when the 6th digit is entered, then the app routes to /.
 */
export async function loginWithPin(page: Page, pin?: string): Promise<void> {
  const digits = (pin ?? process.env.CADENCE_PIN ?? '472394').trim();
  if (digits.length !== 6 || !/^\d{6}$/.test(digits)) {
    throw new Error(`CADENCE_PIN must be exactly 6 digits, got "${digits}"`);
  }

  await page.goto('/');

  // Wait for any of the 6 digit inputs to render.
  const inputs = page.getByRole('textbox');
  await expect(inputs.first()).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 6; i++) {
    await inputs.nth(i).fill(digits[i]);
  }

  // PIN auto-submits at 6 digits → Convex action validates → sessionStorage.cadence_auth = '1'
  // Then any subsequent route render bypasses AccessCodePage.
  // Wait for the sessionStorage flag explicitly; that's the source of truth.
  await page.waitForFunction(
    () => {
      try { return sessionStorage.getItem('cadence_auth') === '1'; } catch { return false; }
    },
    null,
    { timeout: 20_000 },
  );
  // And give the app a tick to re-render after auth state changes.
  await page.waitForTimeout(300);
}

type AuthFixtures = {
  loggedInPage: Page;
};

export const test = base.extend<AuthFixtures>({
  loggedInPage: async ({ page }, use) => {
    await loginWithPin(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
