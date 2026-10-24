import { Page, Locator, expect } from '@playwright/test';

export type AccountAction = 'Yes' | 'No' | 'N/A';

/** Checklist sections, in the order they appear on the Task Checklist page. */
export type ChecklistSection =
  | 'General Questions'
  | 'Reconciliation of Bank / CC / Paypal'
  | 'Reconciliation : Other then Bank & CC'
  | 'Bookkeeping Processing'
  | 'BAS'
  | 'Account Payable'
  | 'Account Receivable'
  | 'Payroll'
  | 'Reports';

export interface TimesheetData {
  subActivity: string;
  units: string;
  notes: string;
}

/**
 * Worksheet > checklist button (opens in a new tab): answer every question of
 * each section, add a timesheet, then Save & Next -> Save & Ready For Review.
 * Works on the page object of the NEW tab.
 */
export class TaskChecklistPage {
  readonly page: Page;

  readonly saveAndNextButton: Locator;
  readonly emailVerifiedCheckbox: Locator;
  readonly readyForReviewButton: Locator;
  readonly addTimesheetButton: Locator;
  readonly timesheetDialog: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.saveAndNextButton = page.getByRole('button', { name: /Save & Next/ });
    // The label sits next to the checkbox instead of naming it, so locate the checkbox by its form control.
    this.emailVerifiedCheckbox = page.locator('p-checkbox[formcontrolname="outcome"] input');
    this.readyForReviewButton = page.getByRole('button', { name: /Save & Ready For Review/i });
    this.addTimesheetButton = page.getByRole('button', { name: /Add Timesheet/i });
    this.timesheetDialog = page.getByRole('dialog', { name: /Timesheet/i });
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  async waitUntilLoaded(): Promise<void> {
    // A "Work in progress" worksheet opens the editable page (edit-task-checklist).
    await this.page.waitForURL(/\/workflow\/worksheet\/(edit-)?task-checklist/);
    await expect(this.page.getByRole('heading', { name: /Task checklist\s*\|/i })).toBeVisible({ timeout: 30000 });
  }

  /**
   * Opens a section and answers every question in it: picks `action` in
   * "Account Action" and writes `comment` in "Account Comment".
   */
  async answerSection(section: ChecklistSection, action: AccountAction, comment: string): Promise<number> {
    const header = this.page.getByRole('button', { name: section, exact: true });
    await header.click();
    const region = this.page.getByRole('region', { name: section, exact: true });
    const rows = region.locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      await row.locator('p-select').first().click();
      await this.page.getByRole('option', { name: action, exact: true }).click();
      // Wait for the option list to close, or the next row sees two lists and the pick is ambiguous.
      await expect(this.page.locator('.p-select-overlay')).toHaveCount(0);
      await row.locator('textarea').fill(comment);
    }

    // Collapse it again so the next section's header/rows are easy to reach.
    await header.click();
    return count;
  }

  /** Adds a timesheet entry from the button at the bottom of the page. */
  async addTimesheet(t: TimesheetData): Promise<void> {
    await this.addTimesheetButton.scrollIntoViewIfNeeded();
    await this.addTimesheetButton.click();
    await expect(this.timesheetDialog).toBeVisible();

    const dialog = this.timesheetDialog;

    // The dialog loads its fields asynchronously: Period ends up prefilled (and disabled) with the
    // worksheet's period, so wait for that. Only pick one if it is somehow still editable and empty.
    const period = dialog.locator('p-select[formcontrolname="period_id"]');
    await expect(period).toHaveClass(/p-filled/, { timeout: 30000 });
    // The app's text is "208-Raising & Solving of the queries" (slightly different wording than
    // the test case), so match on the leading activity code.
    const code = t.subActivity.split('-')[0].trim();
    await dialog.locator('p-select[formcontrolname="subactivity_code"]').click();
    const search = this.page.locator('input.p-select-filter');
    if (await search.first().isVisible().catch(() => false)) await search.first().fill(code);
    await this.page.getByRole('option', { name: new RegExp('^' + code + '-') }).first().click();

    await dialog.locator('p-inputnumber input').fill(t.units);
    await dialog.locator('textarea[formcontrolname="notes"]').fill(t.notes);    await dialog.getByRole('button', { name: /^\s*Save/ }).click();
    await expect(this.timesheetDialog).toBeHidden({ timeout: 15000 });
  }

  async saveAndNext(): Promise<void> {
    // Right after the timesheet dialog closes the page can still be busy and swallow the click,
    // so repeat until the email preview page opens.
    await expect(async () => {
      await this.saveAndNextButton.scrollIntoViewIfNeeded();
      await this.saveAndNextButton.click();
      await this.page.waitForURL(/\/workflow\/worksheet\/task-checklist-email-preview/, { timeout: 15000, waitUntil: 'commit' });
    }).toPass({ timeout: 90000 });
  }

  async confirmEmailVerified(): Promise<void> {
    // Save & Next opens the email preview page.
    await this.page.waitForURL(/\/workflow\/worksheet\/task-checklist-email-preview/);
    // The real <input> is hidden, so click the visible box and check that the input got ticked.
    // The page is still settling (editor loading) and can briefly cover the box, so click it
    // without the actionability wait and repeat until the input is ticked.
    await expect(async () => {
      if (!(await this.emailVerifiedCheckbox.isChecked())) {
        await this.page.locator('p-checkbox[formcontrolname="outcome"] .p-checkbox-box').click({ force: true, timeout: 5000 });
      }
      await expect(this.emailVerifiedCheckbox).toBeChecked({ timeout: 2000 });
    }).toPass({ timeout: 60000 });
  }

  async saveAndReadyForReview(): Promise<void> {
    await expect(this.readyForReviewButton).toBeEnabled();
    await this.readyForReviewButton.click();
    // The worksheet is sent for review and the app leaves the email preview page.
    await this.page.waitForURL((url) => !url.pathname.includes('task-checklist-email-preview'), { timeout: 30000 });
  }

  /** Asserts a success toast (and no error) and returns its text. */
  async expectSuccess(timeout = 30000): Promise<string> {
    try {
      await expect(this.successToast.first()).toBeVisible({ timeout });
    } catch {
      const message = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Action failed${message ? `: ${message}` : ' (no success message shown)'}`);
    }
    return (await this.successToast.first().innerText()).trim();
  }
}






