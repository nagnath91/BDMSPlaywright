import { test } from '@playwright/test';
import { ReviewWorksheetPage } from '../../pages/ReviewWorksheetPage';
import { ReviewChecklistPage } from '../../pages/ReviewChecklistPage';
import { KnockBackChecklistPage } from '../../pages/KnockBackChecklistPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * Workflow > Worksheet > Quick Action > Review Or Knock Back Worksheet
 *
 * Reviews the "Ready for review" worksheet that process-worksheet.spec.ts sent for review, so run
 * that file first. Change REVIEW_USER to run as another user; the password is common to all users
 * (see utils/auth.ts).
 */
const USERNAME = process.env.REVIEW_USER ?? 'Deepakv';
const REVIEWER = 'Deepak Verma';
/** Scenario 6: the team member who processed the worksheet re-answers the knocked back points. */
const KNOCKED_BACK_USER = process.env.PROCESS_USER ?? 'hiteshc';

/** First day of the current month. */
function firstOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

// Scenario 6 re-works the worksheet Scenario 5 knocks back, so run them in order.
test.describe.configure({ mode: 'serial' });
test.setTimeout(480000);

test.describe('Workflow - Review Worksheet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('Scenario 5: Review the worksheet and knock it back', async ({ page }) => {
    const list = new ReviewWorksheetPage(page);
    const monthStart = firstOfCurrentMonth();
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);

    // --- Quick Action > Review Or Knock Back Worksheet, then filter ---
    await list.open();
    await list.filterColumn('Client Name', 'Refresh Renovations');
    await list.filterColumn('Master Activity', 'Bookkeeping');
    await list.filterColumn('Task', 'Bookkeeping Processing');
    await list.filterColumn('Frequency', 'Monthly');
    await list.filterColumn('Period From', monthStart);
    await list.filterColumn('Period To', monthEnd);
    await list.filterColumn('Notes', 'This is Automation');
    await list.filterColumn('Status', 'Ready for review');

    // A worksheet that was just sent for review has no reviewer yet, and only its reviewer gets the
    // editable review page - so make Deepak Verma the reviewer first, then filter on him.
    const first = await list.rowWithStatus('Ready for review');
    if (!(await list.reviewerOf(first)).includes(REVIEWER)) {
      await list.allocateReviewer(first, REVIEWER);
    }
    await list.filterColumn('Reviewer', REVIEWER);
    await list.expectRowsMatch(['Refresh Renovations', 'Ready for review', REVIEWER]);

    // --- Checklist button opens a new tab: switch to it ---
    const row = await list.rowWithStatus('Ready for review');
    const checklistTab = await list.openChecklist(row);
    await checklistTab.bringToFront();

    const checklist = new ReviewChecklistPage(checklistTab);
    await checklist.waitUntilLoaded();

    // --- Review every question of every section ---
    await checklist.reviewSection('General Questions', 'Checked', 'Verified');
    await checklist.reviewSection('Reconciliation of Bank / CC / Paypal', 'Knock back', "Reverified Again It's Test Automation", 'Negligence');
    await checklist.reviewSection('Reconciliation : Other then Bank & CC', 'Checked', 'Verified');
    await checklist.reviewSection('Bookkeeping Processing', 'Checked', 'Verified');
    await checklist.reviewSection('BAS', 'Checked', 'Verified');
    await checklist.reviewSection('Account Payable', 'Checked', 'Verified');
    await checklist.reviewSection('Account Receivable', 'Checked', 'Verified');
    await checklist.reviewSection('Payroll', 'Checked', 'Verified');
    await checklist.reviewSection('Reports', 'Attention', 'Verified');

    // --- Timesheet, then Save & knockback ---
    await checklist.addReviewTimesheet({
      subActivity: '222-review of accounts by Manager',
      units: '10',
      reviewerComment: 'Verified',
      notes: 'Verified with all above Questions',
    });
    await checklist.saveAndKnockBack();

    console.log(`[Scenario 5] success message: "${await checklist.expectSuccess()}"`);
  });
});

test.describe('Workflow - Re-process knocked back Worksheet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, KNOCKED_BACK_USER);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('Scenario 6: Re-answer the knocked back checklist and send for TL/TAM review', async ({ page }) => {
    const list = new ReviewWorksheetPage(page);
    const monthStart = firstOfCurrentMonth();
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);

    // --- Quick Action > Review Or Knock Back Worksheet, then filter to the knocked back worksheet ---
    await list.open();
    await list.filterColumn('Client Name', 'Refresh Renovations');
    await list.filterColumn('Master Activity', 'Bookkeeping');
    await list.filterColumn('Task', 'Bookkeeping Processing');
    await list.filterColumn('Frequency', 'Monthly');
    await list.filterColumn('Period From', monthStart);
    await list.filterColumn('Period To', monthEnd);
    await list.filterColumn('Notes', 'This is Automation');
    await list.filterColumn('Status', 'Knock Back');
    await list.filterColumn('Reviewer', REVIEWER);
    await list.expectRowsMatch(['Refresh Renovations', 'Knock Back', REVIEWER]);

    // --- Checklist button opens a new tab: switch to it ---
    const row = await list.rowWithStatus('Knock Back');
    const checklistTab = await list.openChecklist(row);
    await checklistTab.bringToFront();

    const checklist = new KnockBackChecklistPage(checklistTab);
    await checklist.waitUntilLoaded();

    // --- New Account Comment on every question; the knocked back "No" answers become "Yes" ---
    await checklist.reAnswerSection('General Questions', 'ReVerified');
    await checklist.reAnswerSection('Reconciliation of Bank / CC / Paypal', "Reverified Again It's Test Automation", 'Yes');
    await checklist.reAnswerSection('Reconciliation : Other then Bank & CC', 'ReVerified');
    await checklist.reAnswerSection('Bookkeeping Processing', 'ReVerified');
    await checklist.reAnswerSection('BAS', 'ReVerified');
    await checklist.reAnswerSection('Account Payable', 'ReVerified');
    await checklist.reAnswerSection('Account Receivable', 'ReVerified');
    await checklist.reAnswerSection('Payroll', 'ReVerified');
    await checklist.reAnswerSection('Reports', 'ReVerified');

    // --- Timesheet, confirm the updated reports, Save & Next, email verified, Save & Pending ---
    await checklist.addTimesheet({
      subActivity: '2419-Review Accounts and fill up check list',
      units: '10',
      notes: 'ReVerified with all above Questions',
    });
    await checklist.confirmReportsGenerated();
    await checklist.saveAndNext();
    await checklist.confirmEmailVerified();
    await checklist.saveAndPendingForReview();

    console.log('[Scenario 6] sent for TL/TAM review');
  });
});
