import { test } from '@playwright/test';
import * as fs from 'fs';
import { TravelRequestPage, TravelType, TRAVEL_REQUESTS_FILE, formatDate } from '../../pages/TravelRequestPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > Travel Request > Apply Travel
 *
 * Four requests: Domestic and International, each applied twice - run "A" is
 * meant to be approved and run "B" rejected. Every request starts on its own
 * date; if the app reports an existing travel request for the range, the page
 * object moves it forward a week until it is free. The dates used are written
 * to data/travel-requests.json for tests/My Profile/approve-reject-travel.spec.ts.
 */
const USERNAME = process.env.TRAVEL_USER ?? 'Pankajn';

/** First working day (Mon-Fri) on or after today + `days`. */
function workingDayFromNow(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Next working day after `d`, so the trip spans two days. */
function nextWorkingDay(d: Date): Date {
  const n = new Date(d);
  do { n.setDate(n.getDate() + 1); } while (n.getDay() === 0 || n.getDay() === 6);
  return n;
}

interface Scenario {
  key: string;
  name: string;
  type: TravelType;
  anythingDue: boolean;
  daysAhead: number;
}

const scenarios: Scenario[] = [
  { key: 'domestic-approve',      name: 'Scenario 1: Domestic travel - A (for approval)',      type: 'Domestic',      anythingDue: false, daysAhead: 45 },
  { key: 'domestic-reject',       name: 'Scenario 2: Domestic travel - B (for rejection)',     type: 'Domestic',      anythingDue: false, daysAhead: 60 },
  { key: 'international-approve', name: 'Scenario 3: International travel - A (for approval)', type: 'International', anythingDue: true,  daysAhead: 90 },
  { key: 'international-reject',  name: 'Scenario 4: International travel - B (for rejection)', type: 'International', anythingDue: true, daysAhead: 105 },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.describe('My Profile - Apply Travel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const s of scenarios) {
    test(s.name, async ({ page }) => {
      const travel = new TravelRequestPage(page);
      const from = workingDayFromNow(s.daysAhead);

      await travel.open();
      const used = await travel.apply({
        fromDate: from,
        toDate: nextWorkingDay(from),
        travelType: s.type,
        anythingDue: s.anythingDue,
        dueComment: s.anythingDue ? 'Test Automation' : undefined,
        reason: 'Test Automation',
      });

      console.log(`[${s.name}] success message: "${await travel.expectSaved()}"`);

      // Remember the dates actually used so the approval spec can find the row.
      let saved: Record<string, { from: string; to: string }> = {};
      try { saved = JSON.parse(fs.readFileSync(TRAVEL_REQUESTS_FILE, 'utf8')); } catch { /* first run */ }
      saved[s.key] = { from: formatDate(used.from), to: formatDate(used.to) };
      fs.writeFileSync(TRAVEL_REQUESTS_FILE, JSON.stringify(saved, null, 2));
    });
  }
});

