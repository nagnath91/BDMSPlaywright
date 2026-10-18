import { test } from '@playwright/test';
import { ApplyLeavePage, LeaveType, ONCE_A_YEAR_LEAVES, LeaveAlreadyTakenError } from '../../pages/ApplyLeavePage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > My Leaves > Apply Leave
 *
 * Every scenario is applied twice: run "A" is later approved and run "B"
 * is later rejected by tests/My Profile/approve-reject-leave.spec.ts.
 * Run this file first, then the approval file.
 *
 * Change LEAVE_USER to run as another user; the password is common to all
 * users (see utils/auth.ts).
 */
const USERNAME = process.env.LEAVE_USER ?? 'darshant';

/** Today + `months` months (day clamped), pushed forward `extraDays`, skipping Sat/Sun. */
function leaveStart(months: number, extraDays: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  d.setDate(d.getDate() + extraDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Next working day after `d` (the "one day after From Date" case). */
function nextWorkingDay(d: Date): Date {
  const n = new Date(d);
  do { n.setDate(n.getDate() + 1); } while (n.getDay() === 0 || n.getDay() === 6);
  return n;
}

interface Scenario {
  name: string;
  type: LeaveType;
  months: number;     // months after today for the first date
  offset: number;     // extra days, so no two leaves share a date
  twoDays: boolean;   // To Date = next working day (otherwise same day)
  fullDay: boolean;
}

// 8 leaves, 7 days apart, so none of the date ranges overlap. Maternity
// starts two months out (and two weeks later than the others' last slot).
// If the app still reports an existing leave, the page object shifts the
// range forward a week until it is free.
const base: Omit<Scenario, 'name' | 'offset'>[] = [
  { type: 'Casual',    months: 1, twoDays: true,  fullDay: true },
  { type: 'Comp-off',  months: 1, twoDays: false, fullDay: true },
  { type: 'Sick',      months: 1, twoDays: true,  fullDay: true },
  { type: 'Maternity', months: 2, twoDays: false, fullDay: false },
  // ACCESS-RIGHT BASED: 'Residential Program Leave' only appears in the Leave
  // Type dropdown for users who have the access right. If LEAVE_USER does not
  // have it, the option is missing and these scenarios fail at leave-type
  // selection. It is always applied for NEXT YEAR (12 months out); if that
  // date is already taken, the page object moves to the next free week.
  { type: 'Residential Program Leave', months: 12, twoDays: true, fullDay: true },
];

const runs = ['A (for approval)', 'B (for rejection)'];
const scenarios: Scenario[] = [];
base.forEach((b, i) => {
  runs.forEach((run, r) => {
    const slot = b.type === 'Maternity' || b.type === 'Residential Program Leave' ? 14 + r * 7 : i * 14 + r * 7;
    scenarios.push({ ...b, name: `Scenario ${i + 1}: ${b.type} leave - ${run}`, offset: slot });
  });
});

// Same user for every test, so run them one after another.
test.describe.configure({ mode: 'serial' });

test.describe('My Profile - Apply Leave', () => {
  // Login + date retries + next-year calendar navigation can exceed the 30s default.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const s of scenarios) {
    test(s.name, async ({ page }) => {
      const applyLeave = new ApplyLeavePage(page);
      const fromDate = leaveStart(s.months, s.offset);
      const toDate = s.twoDays ? nextWorkingDay(fromDate) : fromDate;

      await applyLeave.goToMyLeaves();

      // 'Residential Program Leave' can be taken only once in a year and is
      // applied for next year: when the user already has it for that year, the
      // test passes without applying.
      const onceAYear = ONCE_A_YEAR_LEAVES.includes(s.type);
      if (onceAYear && (await applyLeave.hasTakenInYear(s.type, fromDate.getFullYear()))) {
        console.log(`[${s.name}] ${s.type} already taken for ${fromDate.getFullYear()} - nothing to apply, test passes`);
        return;
      }

      await applyLeave.openDialog();
      try {
        await applyLeave.apply(
          {
            leaveType: s.type,
            fromDate,
            toDate,
            comment: 'Test Automation',
            reason: 'Test Automation',
          },
          { fullDay: s.fullDay }
        );
      } catch (e) {
        // The app itself refused it as already taken this year -> pass too.
        if (onceAYear && e instanceof LeaveAlreadyTakenError) {
          console.log(`[${s.name}] app says already taken this year ("${e.message}") - test passes`);
          return;
        }
        throw e;
      }

      const message = await applyLeave.expectSaved();
      console.log(`[${s.name}] success message: "${message}"`);
    });
  }
});
