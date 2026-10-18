import { Page, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';

/** Every user shares the same password. */
export const COMMON_PASSWORD = '123456';

/**
 * Reusable login: opens the login page, signs in with the given username
 * (password is common for all users), ticks the Terms & Conditions checkbox,
 * dismisses the "Work Location" dialog with "Save Location" if it appears,
 * and waits for the dashboard.
 */
export async function loginAs(page: Page, username: string): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto();

  const outcome = await loginPage.loginAndWaitForOutcome(username, COMMON_PASSWORD);
  if (outcome === 'error') {
    const message = await loginPage.getErrorMessage();
    throw new Error(`Login failed for "${username}": ${message ?? 'unknown error'}`);
  }

  await expect(new DashboardPage(page).dashboardHeading).toBeVisible();
}

/**
 * Reusable logout: opens the user menu (top right) and clicks "Logout".
 * Safe to call when the session is already gone.
 */
export async function logout(page: Page): Promise<void> {
  if (page.url().includes('/auth/login')) return;
  await new DashboardPage(page).logout();
}
