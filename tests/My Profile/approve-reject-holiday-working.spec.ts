import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { HolidayWorkingPage, REQUESTS_FILE, formatDate, upcomingSunday } from '../../pages/HolidayWorkingPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > My Holiday Working > Holiday Approval (as the first approver)
 *
 * Run tests/My Profile/apply-holiday-working.spec.ts first; it records the
 * Sundays it used in data/holiday-requests.json.
 */
const APPROVER = process.env.HOLIDAY_APPROVER ?? 'Pankajn';
const EMPLOYEE = 'Nagnath Gejage';
const STATUS = 'Pending For 1stApproval';

function requestDate(key: 'approve' | 'reject'): string {
  try {
    const saved = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
    if (saved[key]) return saved[key];
  } catch { /* fall back to the default Sundays */ }
  return formatDate(upcomingSunday(key === 'approve' ? 0 : 1));
}

test.describe.configure({ mode: 'serial' });

test.describe('My Profile - Holiday Working Approval', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, APPROVER);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('Scenario 1: Approve the holiday working request', async ({ page }) => {
    const holiday = new HolidayWorkingPage(page);
    const date = requestDate('approve');

    await holiday.open();
    await holiday.filterRequests(EMPLOYEE, date, STATUS);
    await holiday.openApproval(EMPLOYEE, date, STATUS);
    const message = await holiday.decide('Approve', 'Test Automation');

    console.log(`[Approve ${date}] message: "${message}"`);
    await expect(page.locator('.p-toast-message-error')).toHaveCount(0);
  });

  test('Scenario 2: Reject the holiday working request', async ({ page }) => {
    const holiday = new HolidayWorkingPage(page);
    const date = requestDate('reject');

    await holiday.open();
    await holiday.filterRequests(EMPLOYEE, date, STATUS);
    await holiday.openApproval(EMPLOYEE, date, STATUS);
    const message = await holiday.decide('Reject', 'Test Automation');

    console.log(`[Reject ${date}] message: "${message}"`);
    await expect(page.locator('.p-toast-message-error')).toHaveCount(0);
  });
});

