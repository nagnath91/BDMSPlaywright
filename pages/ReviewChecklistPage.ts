import { expect, Locator, Page } from '@playwright/test';
import { ChecklistSection, TaskChecklistPage } from './TaskChecklistPage';

export type ReviewerAction = 'Checked' | 'Knock back' | 'Attention';

export interface ReviewTimesheetData {
  subActivity: string;
  units: string;
  notes: string;
}

/**
 * Reviewer's version of the Task Checklist (opened from the checklist button of
 * Review Or Knock Back Worksheet): every question gets a "Reviewer Action" and a
 * "Reviewer Comment"; a knocked back question also needs a reason. Works on the
 * page of the NEW tab.
 */
export class ReviewChecklistPage extends TaskChecklistPage {
  readonly saveAndKnockBackButton: Locator;

  constructor(page: Page) {
    super(page);
    this.saveAndKnockBackButton = page.getByRole('button', { name: /Save & Knock ?back/i });
  }

  async waitUntilLoaded(): Promise<void> {
    await this.page.waitForURL(/\/workflow\/worksheet\/edit-task-checklist/);
    await expect(this.page.getByRole('heading', { name: /Task checklist\s*\|/i })).toBeVisible({ timeout: 30000 });
  }

  /** Picks `option` in the open p-select list. */
  private async pickOption(select: Locator, option: string | RegExp): Promise<void> {
    await select.click();
    await this.page.getByRole('option', { name: option, exact: typeof option === 'string' }).first().click();
    await expect(this.page.locator('.p-select-overlay')).toHaveCount(0);
  }

  /**
   * Opens a section and, for every question, picks the Reviewer Action and writes the Reviewer
   * Comment. When `reason` is given (needed for "Knock back") the second dropdown of the
   * comment cell is picked too. Returns the number of questions handled.
   */
  async reviewSection(section: ChecklistSection, action: ReviewerAction, comment: string, reason?: string): Promise<number> {
    const header = this.page.getByRole('button', { name: section, exact: true });
    const region = this.page.getByRole('region', { name: section, exact: true });
    const rows = region.locator('tbody tr');
    // Some sections are already open on this page, so only click the header if the rows are hidden.
    await expect(async () => {
      if (!(await rows.first().isVisible().catch(() => false))) {
        // Clicking the middle of the header can land on its (disabled) checkbox, so open it from the keyboard.
        await header.focus();
        await this.page.keyboard.press('Enter');
      }
      await expect(rows.first()).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 40000 });

    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const [actionCell, commentCell] = [row.locator('td').nth(4), row.locator('td').nth(5)];

      await this.pickOption(actionCell.locator('p-select').first(), new RegExp('^' + action + '$', 'i'));
      await commentCell.locator('textarea').fill(comment);
      if (reason) {
        await this.pickOption(commentCell.locator('p-select').first(), new RegExp(reason, 'i'));
      }
    }

    if (await rows.first().isVisible().catch(() => false)) await header.click();
    return count;
  }

  /** Adds the reviewer's timesheet; ticks every "Reviewer write off reason" check. */
  async addReviewTimesheet(t: ReviewTimesheetData): Promise<void> {
    await this.addTimesheetButton.scrollIntoViewIfNeeded();
    await this.addTimesheetButton.click();
    const dialog = this.timesheetDialog;
    await expect(dialog).toBeVisible();

    // The reviewer's dialog has no Period field; the worksheet details sit in the dialog header.
    await expect(dialog.locator('p-select[formcontrolname="subactivity_code"]')).toBeVisible();
    // Give the dialog time to finish loading, or its late reset wipes what we type.
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(2000);

    const code = t.subActivity.split('-')[0].trim();
    await dialog.locator('p-select[formcontrolname="subactivity_code"]').click();
    const search = this.page.locator('input.p-select-filter');
    if (await search.first().isVisible().catch(() => false)) await search.first().fill(code);
    await this.page.getByRole('option', { name: new RegExp('^' + code + '-') }).first().click();

    await expect(dialog.locator('p-select[formcontrolname="subactivity_code"]')).toContainText(code);

    const units = dialog.locator('p-inputnumber input');
    await units.fill(t.units);
    await this.page.keyboard.press('Tab');

    // "Reviewer Write Off Reason" is loaded by the app after the sub activity + units are in, which
    // can take a while. Wait for it; if it has not shown up, enter the units again to trigger it.
    const boxes = dialog.locator('p-checkbox');
    await expect(async () => {
      if (!(await boxes.first().isVisible().catch(() => false))) {
        await this.page.waitForTimeout(4000);
        if (!(await boxes.first().isVisible().catch(() => false))) {
          await units.fill('');
          await units.fill(t.units);
          await this.page.keyboard.press('Tab');
        }
      }
      await expect(boxes.first()).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 90000 });
    // Let the whole list of checks render before ticking them.
    await this.page.waitForTimeout(1500);
    for (let i = 0; i < (await boxes.count()); i++) {
      const box = boxes.nth(i);
      // The transparent <input> sits over the visible box and receives the click.
      if (!(await box.locator('input').isChecked())) await box.locator('input').click({ force: true });
      await expect(box.locator('input')).toBeChecked();
    }

    await dialog.locator('textarea[formcontrolname="reviewer_comment"]').fill(t.reviewerComment);
    await dialog.locator('textarea[formcontrolname="notes"]').fill(t.notes);
    await dialog.getByRole('button', { name: /^\s*Save/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
  }

  async saveAndKnockBack(): Promise<void> {
    await this.saveAndKnockBackButton.scrollIntoViewIfNeeded();
    await expect(this.saveAndKnockBackButton).toBeEnabled();
    await this.saveAndKnockBackButton.click();
    // The worksheet is knocked back and the app leaves the edit page.
    await this.page.waitForURL((url) => !url.pathname.includes('edit-task-checklist'), { timeout: 30000 });
  }
}

















