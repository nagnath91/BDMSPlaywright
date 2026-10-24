import { Page, Locator, expect } from '@playwright/test';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface WorksheetData {
  tradingName: string;
  masterActivity: string;
  task: string;
  criticalTask: 'Yes' | 'No';
  startDate: Date;
  endDate: Date;
  frequency: string;
  /** Day of the month the worksheet is due ("On Date of month"). */
  dueDayOfMonth: string;
  notes: string;
}

/** Workflow > Worksheet > Quick Action > Add Worksheet. */
export class AddWorksheetPage {
  readonly page: Page;

  readonly workflowMenu: Locator;
  readonly worksheetMenu: Locator;
  readonly quickActionButton: Locator;
  readonly addWorksheetItem: Locator;
  readonly calendar: Locator;
  readonly monthsSelect: Locator;
  readonly dueDayInput: Locator;
  readonly notes: Locator;
  readonly saveAndNextButton: Locator;
  readonly createOnlyButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.workflowMenu = page.getByRole('link', { name: 'Workflow' }).first();
    this.worksheetMenu = page.getByRole('link', { name: 'Worksheet', exact: true });
    this.quickActionButton = page.getByRole('button', { name: 'Quick Action' });
    this.addWorksheetItem = page.getByRole('menuitem', { name: 'Add Worksheet' });
    this.calendar = page.getByRole('dialog', { name: 'Choose Date' });
    this.monthsSelect = page.locator('p-multiselect:has(#add-worksheet-multi-month-input)');
    this.dueDayInput = page.locator('#add-worksheet-due-month-day-input');
    this.notes = page.locator('#add-worksheet-notes-input');
    this.saveAndNextButton = page.getByRole('button', { name: 'Save & Next' });
    this.createOnlyButton = page.getByRole('button', { name: /Create worksheet Only/i });
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** Workflow (side menu) -> Worksheet -> Quick Action -> Add Worksheet. */
  async open(): Promise<void> {
    await this.workflowMenu.click();
    await this.worksheetMenu.click();
    await this.page.waitForURL(/\/workflow\/dashboard\/incomplete-worksheet/);
    await this.quickActionButton.click();
    await this.addWorksheetItem.click();
    await this.page.waitForURL(/\/workflow\/worksheet\/add-worksheet/);
    await expect(this.page.locator('#add-worksheet-start-date-input')).toBeVisible();
  }

  /** Opens a p-select by form control name, types into its search box if it has one, and picks the option. */
  private async selectOption(formControlName: string, option: string): Promise<void> {
    const select = this.page.locator(`p-select[formcontrolname="${formControlName}"]`);
    await expect(select).toBeVisible();
    await expect(select).not.toHaveClass(/p-disabled/);
    await select.click();
    const search = this.page.locator('input.p-select-filter');
    if (await search.isVisible().catch(() => false)) await search.fill(option);
    await this.page.getByRole('option', { name: option, exact: true }).first().click();
  }

  /** Picks a date through the calendar popup (typing does not update the form model). */
  async pickDate(input: Locator, date: Date): Promise<void> {
    await input.click();
    await expect(this.calendar).toBeVisible();

    const targetIndex = date.getFullYear() * 12 + date.getMonth();
    for (let i = 0; i < 60; i++) {
      const month = (await this.calendar.getByRole('button', { name: 'Choose Month' }).innerText()).trim();
      const year = Number((await this.calendar.getByRole('button', { name: 'Choose Year' }).innerText()).trim());
      const shownIndex = year * 12 + MONTHS.indexOf(month);
      if (shownIndex === targetIndex) break;
      const step = shownIndex < targetIndex ? 1 : -1;
      await this.calendar.getByRole('button', { name: step === 1 ? 'Next Month' : 'Previous Month' }).click();
      // Wait for the header to show the new month before reading it again.
      const newIndex = shownIndex + step;
      await expect(this.calendar.getByRole('button', { name: 'Choose Month' })).toHaveText(MONTHS[((newIndex % 12) + 12) % 12]);
      await expect(this.calendar.getByRole('button', { name: 'Choose Year' })).toHaveText(String(Math.floor(newIndex / 12)));
    }

    await this.calendar
      .locator('td:not(.p-datepicker-other-month)')
      .getByText(String(date.getDate()), { exact: true })
      .click();
    await expect(this.calendar).toBeHidden();
  }

  async fill(d: WorksheetData): Promise<void> {
    await this.selectOption('entity_id', d.tradingName);
    await this.selectOption('master_activity_id', d.masterActivity);
    await this.selectOption('task_id', d.task); // enabled once a master activity is chosen
    await this.selectOption('critical_task', d.criticalTask);

    await this.pickDate(this.page.locator('#add-worksheet-start-date-input'), d.startDate);
    await this.pickDate(this.page.locator('#add-worksheet-end-date-input'), d.endDate);

    await this.selectOption('frequency_id', d.frequency);

    // Month list appears for Monthly: tick the "select all" checkbox in its header.
    await this.monthsSelect.click();
    await this.page.locator('.p-multiselect-overlay').getByRole('checkbox').first().check({ force: true });
    await this.page.keyboard.press('Escape');

    await this.page.locator('#add-worksheet-due-date-period-input').getByText('On Date of month').click();
    await this.dueDayInput.fill(d.dueDayOfMonth);

    await this.notes.fill(d.notes);
  }

  async saveAndNext(): Promise<void> {
    await expect(this.saveAndNextButton).toBeEnabled();
    await this.saveAndNextButton.click();
  }

  /** On the follow-up screen/dialog choose "Create worksheet Only". */
  async createWorksheetOnly(): Promise<void> {
    await expect(this.createOnlyButton).toBeVisible();
    await this.createOnlyButton.click();
  }

  /**
   * After "Create worksheet Only" the app returns to the worksheet list. Asserts
   * that redirect (throwing with the error toast text if it never happens) and
   * returns the last success message seen ("Successfully generated worksheet detail"
   * comes from the Save & Next step).
   */
  async expectCreated(timeout = 30000): Promise<string> {
    const message = (await this.successToast.first().innerText().catch(() => '')).trim();
    try {
      await this.page.waitForURL(/\/workflow\/dashboard\/incomplete-worksheet|\/workflow\/worksheet(?!\/add-worksheet)/, { timeout });
    } catch {
      const error = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Worksheet was not created${error ? `: ${error}` : ' (still on the Add Worksheet page)'}`);
    }
    return message;
  }
}
