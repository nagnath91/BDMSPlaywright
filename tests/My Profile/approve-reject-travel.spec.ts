import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { TravelRequestPage, TravelType, TRAVEL_REQUESTS_FILE } from '../../pages/TravelRequestPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > Travel Request > Travel Approval
 *
 * Run tests/My Profile/apply-travel.spec.ts first; it records the dates of the
 * four requests it creates (as Pankajn) in data/travel-requests.json.
 * Domestic and International are each approved ("A") and rejected ("B").
 */
const APPROVER = process.env.TRAVEL_APPROVER ?? 'vasant';
const EMPLOYEE = 'Pankaj Nahar';

function requestDates(key: string): { from: string; to: string } {
  const saved = JSON.parse(fs.readFileSync(TRAVEL_REQUESTS_FILE, 'utf8'));
  if (!saved[key]) throw new Error(`No "${key}" request recorded - run apply-travel.spec.ts first`);
  return saved[key];
}

interface Scenario {
  name: string;
  key: string;
  type: TravelType;
  decision: 'Approve' | 'Reject';
  comment: string;
}

const scenarios: Scenario[] = [
  { name: 'Scenario 1: Approve Domestic travel',      key: 'domestic-approve',      type: 'Domestic',      decision: 'Approve', comment: 'Test Approve Test Automation' },
  { name: 'Scenario 2: Reject Domestic travel',       key: 'domestic-reject',       type: 'Domestic',      decision: 'Reject',  comment: 'Test Reject Test Automation' },
  { name: 'Scenario 3: Approve International travel', key: 'international-approve', type: 'International', decision: 'Approve', comment: 'Test Approve Test Automation' },
  { name: 'Scenario 4: Reject International travel',  key: 'international-reject',  type: 'International', decision: 'Reject',  comment: 'Test Reject Test Automation' },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.describe('My Profile - Travel Approval', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, APPROVER);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const s of scenarios) {
    test(s.name, async ({ page }) => {
      const travel = new TravelRequestPage(page);
      const { from, to } = requestDates(s.key);

      await travel.openList();
      const row = await travel.filterRequests(EMPLOYEE, from, to, s.type);
      await expect(row).toContainText('Pending For 1stApproval');

      await travel.openApproval(row);
      const message = await travel.decide(s.decision, s.comment);

      console.log(`[${s.name}] ${from} - ${to}: "${message}"`);
      await expect(page.locator('.p-toast-message-error')).toHaveCount(0);
    });
  }
});
