import { test, expect } from '@playwright/test';

test('TC-SMK-EXAMPLE — homepage reachable', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');

  await expect(page).toHaveTitle(/Cadence/);
  expect(errors, 'no console errors').toEqual([]);
});
