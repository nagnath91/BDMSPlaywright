import { test } from '@playwright/test';
import { AddWorksheetPage } from '../../pages/AddWorksheetPage';
import { WorksheetListPage, formatDate } from '../../pages/WorksheetListPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * Workflow > Worksheet > Quick Action > Add Worksheet
 *
 * Change WORKFLOW_USER to run as another user; the password is common to all
 * users (see utils/auth.ts).
 */
const USERNAME = process.env.WORKFLOW_USER ?? 'Darshant';

/** First day of the current month. */
function firstOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

/**
 * Last day of the 6th month counting the start month as the 1st
 * (start in October -> 31 March), so the 6 monthly worksheets Oct..Mar fit.
 */
function lastDayOfSixthMonth(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth() + 6, 0, 12);
}

// Scenario 2 depends on the worksheets Scenario 1 creates, so run them one after
// another in file order (not in parallel). If Scenario 1 fails, Scenario 2 is skipped.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.describe('Workflow - Add Worksheet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('Scenario 1: Add worksheet - Bookkeeping Processing, monthly', async ({ page }) => {
    const worksheet = new AddWorksheetPage(page);
    const startDate = firstOfCurrentMonth();

    await worksheet.open();
    await worksheet.fill({
      tradingName: 'Refresh Renovations',
      masterActivity: 'Bookkeeping',
      task: 'Bookkeeping Processing',
      criticalTask: 'Yes',
      startDate,
      endDate: lastDayOfSixthMonth(startDate),
      frequency: 'Monthly',
      dueDayOfMonth: '1',
      notes: 'This is Automation',
    });
    await worksheet.saveAndNext();
    await worksheet.createWorksheetOnly();

    console.log(`[Scenario 1] success message: "${await worksheet.expectCreated()}"`);
  });

  /**
   * Scenario 2 works on the worksheets Scenario 1 created, so run it after
   * Scenario 1. Filters the current 6 months, picks the first "Not started"
   * worksheet of the current month, moves it to Work in progress and adds an
   * additional assignee.
   */
  test('Scenario 2: Change status to Work in progress and allocate additional assignee', async ({ page }) => {
    const list = new WorksheetListPage(page);
    const monthStart = firstOfCurrentMonth();
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);

    await list.open();
    await list.applyDateRange(monthStart, lastDayOfSixthMonth(monthStart));

    await list.filterColumn('Client Name', 'Refresh Renovations');
    await list.filterColumn('Master Activity', 'Bookkeeping');
    await list.filterColumn('Task', 'Bookkeeping Processing');
    await list.filterColumn('Frequency', 'Monthly');
    await list.filterColumn('Period From', monthStart);
    await list.filterColumn('Period To', monthEnd);
    await list.filterColumn('Notes', 'This is Automation');

    // Every listed worksheet must be for the current month (Period From = 1st, Period To = last day).
    await list.expectRowsMatch([formatDate(monthStart), formatDate(monthEnd)]);

    const row = await list.notStartedRow();
    await list.startWork(row);
    console.log(`[Scenario 2] status message: "${await list.expectSuccess()}"`);

    await list.allocateAdditionalAssignee(row, 'Hitesh Choithramani');
    console.log(`[Scenario 2] assign message: "${await list.expectSuccess()}"`);
  });
});


