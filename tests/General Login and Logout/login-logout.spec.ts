import { test, expect } from '@playwright/test';
import path from 'path';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { readUsersFromCsv } from '../../utils/csvReader';

/**
 * Data-driven login/logout suite.
 *
 * Credentials come from a CSV file with the header:
 *   user_login_name,password
 *
 * Override the CSV location with LOGIN_CSV_PATH (absolute or relative
 * to the project root). Defaults to data/users.csv.
 *
 * Because the CSV can contain hundreds/thousands of rows, use
 * USER_LIMIT to cap how many rows are turned into tests while
 * iterating on the framework, e.g.:
 *
 *   USER_LIMIT=10 npx playwright test tests/login-logout.spec.ts --project=chromium
 *
 * Remove USER_LIMIT (or set it to 0) to run the full CSV.
 */
const csvPath = process.env.LOGIN_CSV_PATH ?? path.resolve(__dirname, '../data/users.csv');
const allUsers = readUsersFromCsv(csvPath);

const limit = Number(process.env.USER_LIMIT);
const users = Number.isFinite(limit) && limit > 0 ? allUsers.slice(0, limit) : allUsers;

test.describe('Data-driven Login/Logout', () => {
  users.forEach(({ username, password }, index) => {
    test(`[${index + 1}/${users.length}] login and logout - ${username}`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);

      await loginPage.goto();

      const outcome = await loginPage.loginAndWaitForOutcome(username, password);

      if (outcome === 'error') {
        const message = await loginPage.getErrorMessage();
        throw new Error(`Login failed for "${username}": ${message ?? 'unknown error'}`);
      }

      expect(dashboardPage.isLoaded(), `Expected dashboard to load for "${username}"`).toBeTruthy();
      await expect(dashboardPage.dashboardHeading).toBeVisible();

      await dashboardPage.logout();

      expect(loginPage.isOnLoginPage(), `Expected to be back on login page after logout for "${username}"`).toBeTruthy();
    });
  });
});
