import { test } from '@playwright/test';
import * as fs from 'fs';
import { HolidayWorkingPage, REQUESTS_FILE, formatDate, upcomingSunday } from '../../pages/HolidayWorkingPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > My Holiday Working > Apply Holiday
 *
 * Two requests are created - "approve" is later approved and "reject" is later
 * rejected by tests/My Profile/approve-reject-holiday-working.spec.ts. Run
 * this file first. The Sundays used are written to
 * data/holiday-requests.json so the approval spec can find the rows.
 */
const USERNAME = process.env.HOLIDAY_USER ?? 'Nagnathg';

const scenarios = [
  { key: 'approve', name: 'Apply holiday working - request for approval', weeksAhead: 0 },
  { key: 'reject', name: 'Apply holiday working - request for rejection', weeksAhead: 1 },
] as const;

test.describe.configure({ mode: 'serial' });

test.describe('My Profile - Apply Holiday Working', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const s of scenarios) {
    test(s.name, async ({ page }) => {
      const holiday = new HolidayWorkingPage(page);

      await holiday.open();
      await holiday.openApplyDialog();
      const date = await holiday.apply({
        location: 'SEZ - Brigade',
        date: upcomingSunday(s.weeksAhead),
        arrivalTime: '09:00',
        departureTime: '18:00',
        tradingName: 'Befree Pty Limited',
        reason: 'TEST Automation',
      });

      const message = await holiday.expectSaved();
      console.log(`[${s.name}] ${formatDate(date)} - success message: "${message}"`);

      let saved: Record<string, string> = {};
      try { saved = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8')); } catch { /* first run */ }
      saved[s.key] = formatDate(date);
      fs.writeFileSync(REQUESTS_FILE, JSON.stringify(saved, null, 2));
    });
  }
});

