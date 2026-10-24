import { expect, Locator, Page } from '@playwright/test';
import { ChecklistSection, TaskChecklistPage } from './TaskChecklistPage';

/**
 * The editable checklist of a worksheet that the reviewer knocked back (opened from the
 * checklist button of Review Or Knock Back Worksheet as the team member): every question
 * needs a fresh Account Comment and the knocked back answers can be changed. Works on the
 * page of the NEW tab.
 */
export class KnockBackChecklistPage extends TaskChecklistPage {
  readonly saveAndPendingButton: Locator;

  constructor(page: Page) {
    super(page);
    this.saveAndPendingButton = page.getByRole('button', { name: /Save & Pending for TL\/TAM Review/i });
  }

  async waitUntilLoaded(): Promise<void> {
    await this.page.waitForURL(/\/workflow\/worksheet\/edit-task-checklist/);
    await expect(this.page.getByRole('heading', { name: /Task checklist\s*\|/i })).toBeVisible({ timeout: 30000 });
  }

  /**
   * Opens a section and writes `comment` in the Account Comment of every question. When
   * `changeActionTo` is given, every question that still has an editable Account Action
   * (the knocked back ones) is switched to that value. Returns the number of questions.
   */
  async reAnswerSection(section: ChecklistSection, comment: string, changeActionTo?: 'Yes' | 'No' | 'N/A'): Promise<number> {
    const header = this.page.getByRole('button', { name: section, exact: true });
    const region = this.page.getByRole('region', { name: section, exact: true });
    const rows = region.locator('tbody tr');

    // Some sections are already open, and clicking the header can hit its disabled checkbox,
    // so open closed ones from the keyboard and retry until the rows are visible.
    await expect(async () => {
      if (!(await rows.first().isVisible().catch(() => false))) {
        await header.focus();
        await this.page.keyboard.press('Enter');
      }
      await expect(rows.first()).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 40000 });

    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);

      if (changeActionTo) {
        const action = row.locator('p-select').first();
        if (await action.count()) {
          // A filled select shows a clear (x) icon in the middle, so open it from the arrow instead.
          await action.locator('.p-select-dropdown').click();
          await this.page.getByRole('option', { name: changeActionTo, exact: true }).click();
          await expect(this.page.locator('.p-select-overlay')).toHaveCount(0);
        }
      }

      const commentBox = row.locator('textarea').first();
      if (await commentBox.count()) await commentBox.fill(comment);
    }

    if (await rows.first().isVisible().catch(() => false)) {
      await header.focus();
      await this.page.keyboard.press('Enter');
    }
    return count;
  }

  /** Ticks "I confirm that I have generated the updated reports after taking into account the knock back points." */
  async confirmReportsGenerated(): Promise<void> {
    const label = this.page.locator('label').filter({ hasText: /I confirm that I have generated the updated reports/i });
    await label.scrollIntoViewIfNeeded();
    const checkbox = label.locator('xpath=ancestor::*[.//p-checkbox][1]').locator('p-checkbox input').first();
    await expect(async () => {
      if (!(await checkbox.isChecked())) await checkbox.click({ force: true });
      await expect(checkbox).toBeChecked({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
  }

  async saveAndPendingForReview(): Promise<void> {
    await expect(this.saveAndPendingButton).toBeEnabled();
    await this.saveAndPendingButton.click();
    // The worksheet goes back for TL/TAM review and the app leaves the email preview page.
    await this.page.waitForURL((url) => !url.pathname.includes('task-checklist-email-preview'), { timeout: 30000 });
  }
}



