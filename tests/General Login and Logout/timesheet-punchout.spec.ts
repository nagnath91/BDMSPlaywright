import { test, expect } from '@playwright/test';
import path from 'path';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { AddTimesheetDialog, TimesheetEntry } from '../../pages/AddTimesheetDialog';
import { PunchClock } from '../../pages/PunchClock';
import { readUsersFromCsv } from '../../utils/csvReader';

/**
 * Data-driven: Login -> Add Timesheet -> Punch Out.
 *
 * For every user in the CSV:
 *   1. goto http://10.10.20.41/auth/login
 *   2-4. fill username/password from the CSV row, click Login
 *   5. dismiss the "Work Location" dialog if shown, keeping the default
 *      location, by clicking "Save Location" (handled by LoginPage)
 *   6-7. open the "Add Options" menu (top right) -> "Add Timesheet"
 *   8. fill the Add Timesheet form with the fixed values below and Save
 *   9-10. open the "Units" panel (top right) -> "Punch out"
 *   11. confirm "Yes, Punch out" if the app prompts for it
 *
 * Credentials come from a CSV file with the header:
 *   user_login_name,password
 * Override the CSV location with LOGIN_CSV_PATH. Use USER_LIMIT to cap
 * how many rows are turned into tests while iterating.
 *
 * This suite is meant to run in parallel. Playwright's config already has
 * fullyParallel: true, so recommend running it with a fixed worker count
 * tuned to what the target server can take, e.g.:
 *
 *   npx playwright test tests/timesheet-punchout.spec.ts --project=chromium --workers=2
 *
 * Raise --workers (and USER_LIMIT while validating) only once the server
 * is confirmed to handle the extra concurrent load - this flow does more
 * per test (a multi-field form submission + a punch-out) than a plain
 * login/logout, so it is heavier per worker.
 */
const TIMESHEET_ENTRY: TimesheetEntry = {
  tradingName: 'Befree Pty Limited',
  masterActivity: 'IT Web Development',
  task: 'Web Development General',
  frequency: 'Yearly',
  period: '01-07-2022 To 30-06-2023',
  subActivity: '1024-Server setup / Upload / Testing',
  units: 10,
  notes: 'Test Automation',
};

const csvPath = process.env.LOGIN_CSV_PATH ?? path.resolve(__dirname, '../data/users.csv');
const allUsers = readUsersFromCsv(csvPath);

const limit = Number(process.env.USER_LIMIT);
const users = Number.isFinite(limit) && limit > 0 ? allUsers.slice(0, limit) : allUsers;

test.describe('Add Timesheet and Punch Out (data-driven)', () => {
  test.describe.configure({ mode: 'parallel' });

  users.forEach(({ username, password }, index) => {
    test(`[${index + 1}/${users.length}] add timesheet and punch out - ${username}`, async ({ page }) => {
      // This flow is heavier than a plain login/logout (a multi-field form
      // submission plus a punch-out) and the "Save Location" button can sit
      // disabled/loading noticeably longer under concurrent load, so give
      // it more headroom than the default 30s test timeout.
      test.setTimeout(120000);

      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);
      const timesheetDialog = new AddTimesheetDialog(page);
      const punchClock = new PunchClock(page);

      await loginPage.goto();

      const outcome = await loginPage.loginAndWaitForOutcome(username, password);
      if (outcome === 'error') {
        const message = await loginPage.getErrorMessage();
        throw new Error(`Login failed for "${username}": ${message ?? 'unknown error'}`);
      }

      await dashboardPage.openAddTimesheetDialog();
      await timesheetDialog.waitUntilVisible();
      await timesheetDialog.fillAndSave(TIMESHEET_ENTRY);

      await punchClock.open();
      await punchClock.punchOut();

      await expect(punchClock.outTimeLabel).toBeVisible();
    });
  });
});
