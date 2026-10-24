import { test, Page } from '@playwright/test';
import { WorksheetListPage } from '../../pages/WorksheetListPage';
import { TaskChecklistPage } from '../../pages/TaskChecklistPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * Workflow > Worksheet > checklist > Save & Ready For Review
 *
 * Processes the "Work in progress" worksheet that add-worksheet.spec.ts
 * (Scenario 1 + 2) created and assigned to hiteshc, so run that file first.
 *
 * Change PROCESS_USER to run as another user; the password is common to all
 * users (see utils/auth.ts).
 */
const USERNAME = process.env.PROCESS_USER ?? 'hiteshc';

/** First day of the current month. */
function firstOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

/** Last day of the 6th month counting the current month as the 1st. */
function lastDayOfSixthMonth(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth() + 6, 0, 12);
}

/**
 * Workflow > Worksheet with the date range (current month .. last day of the 6th month) and the
 * column filters for this month's Refresh Renovations / Bookkeeping Processing worksheets applied.
 */
async function openFilteredWorksheets(page: Page): Promise<WorksheetListPage> {
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
  // This user's grid does not show the Period columns, so the rows can't be checked for the
  // dates; filterColumn() already verified the Period From / To filters hold this month's dates.
  await list.expectRowsMatch(['Refresh Renovations', 'Bookkeeping Processing']);
  return list;
}

// Scenario 4 follows Scenario 3 (it needs the worksheet Scenario 3 sends for review).
test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

test.describe('Workflow - Process Worksheet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('Scenario 3: Answer the checklist, add timesheet and send for review', async ({ page }) => {
    // --- Workflow > Worksheet, filter to this month's Refresh Renovations worksheet ---
    const list = await openFilteredWorksheets(page);

    // --- Checklist button opens a new tab: switch to it ---
    const row = await list.rowWithStatus('Work in progress');
    const checklistTab = await list.openChecklist(row);
    await checklistTab.bringToFront();

    const checklist = new TaskChecklistPage(checklistTab);
    await checklist.waitUntilLoaded();

    // --- Answer every question of every section ---
    await checklist.answerSection('General Questions', 'Yes', 'Done');
    await checklist.answerSection('Reconciliation of Bank / CC / Paypal', 'No', "Please Ignore it's Automation");
    await checklist.answerSection('Reconciliation : Other then Bank & CC', 'Yes', 'Done');
    await checklist.answerSection('Bookkeeping Processing', 'Yes', 'Done');
    await checklist.answerSection('BAS', 'Yes', 'Done');
    await checklist.answerSection('Account Payable', 'Yes', 'Done');
    await checklist.answerSection('Account Receivable', 'Yes', 'Done');
    await checklist.answerSection('Payroll', 'Yes', 'Done');
    await checklist.answerSection('Reports', 'N/A', "Please Ignore it's Automation");

    // --- Timesheet, Save & Next, email verified, Save & Ready For Review ---
    await checklist.addTimesheet({
      subActivity: '208-Raising & Solving of queries',
      units: '10',
      notes: 'Verified with all above Questions',
    });
    await checklist.saveAndNext();
    await checklist.confirmEmailVerified();
    await checklist.saveAndReadyForReview();

    console.log(`[Scenario 3] success message: "${await checklist.expectSuccess()}"`);
  });

  /** Runs after Scenario 3, which is what moves the worksheet to "Ready for review". */
  test('Scenario 4: Allocate additional assignee on the Ready for review worksheet', async ({ page }) => {
    const list = await openFilteredWorksheets(page);

    // Status must be "Ready for review".
    const row = await list.rowWithStatus('Ready for review');

    await list.allocateAdditionalAssignee(row, 'Deepak Verma');
    console.log(`[Scenario 4] assign message: "${await list.expectSuccess()}"`);
  });
});


