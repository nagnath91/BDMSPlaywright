import { Page, Locator } from '@playwright/test';

export interface TimesheetEntry {
  tradingName: string;
  masterActivity: string;
  task: string;
  frequency: string;
  period: string;
  subActivity: string;
  units: string | number;
  notes: string;
}

/**
 * The "Add Timesheet" modal (PrimeNG p-dialog). Its dropdown fields are
 * p-select components that cascade: Trading Name must be chosen before
 * Master Activity enables, which must be chosen before Task enables, etc.
 *
 * Each field is located by its Angular `formcontrolname` attribute rather
 * than PrimeNG's auto-generated DOM ids (e.g. #pn_id_108), which are not
 * stable across page loads/sessions.
 */
export class AddTimesheetDialog {
  readonly page: Page;
  readonly dialog: Locator;

  readonly tradingName: Locator;
  readonly masterActivity: Locator;
  readonly task: Locator;
  readonly frequency: Locator;
  readonly period: Locator;
  readonly subActivity: Locator;
  readonly unitsInput: Locator;
  readonly notesTextarea: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: 'Add Timesheet' });

    this.tradingName = this.dialog.locator('[formcontrolname="entity_id"]');
    this.masterActivity = this.dialog.locator('[formcontrolname="master_activity_id"]');
    this.task = this.dialog.locator('[formcontrolname="task_id"]');
    this.frequency = this.dialog.locator('[formcontrolname="frequency_id"]');
    this.period = this.dialog.locator('[formcontrolname="period_id"]');
    this.subActivity = this.dialog.locator('[formcontrolname="subactivity_code"]');
    this.unitsInput = this.dialog.locator('[formcontrolname="units"] input');
    this.notesTextarea = this.dialog.locator('textarea[formcontrolname="notes"]');
    // There are two primary buttons ("Save" and "Save & Add New"); match exactly.
    this.saveButton = this.dialog.getByRole('button', { name: 'Save', exact: true });
  }

  async waitUntilVisible(timeout = 30000): Promise<void> {
    await this.dialog.waitFor({ state: 'visible', timeout });
  }

  /**
   * Some accounts get a one-time onboarding/help popover ("Timesheet Form"
   * banner with a "×" Close button) layered on top of this dialog the
   * first time it opens. It intercepts clicks on the fields behind it, so
   * it's dismissed before interacting with the form.
   */
  private async dismissOnboardingTourIfPresent(timeout = 3000): Promise<void> {
    const tour = this.page.getByRole('dialog').filter({ hasText: 'Timesheet Form' });

    try {
      await tour.waitFor({ state: 'visible', timeout });
    } catch {
      return;
    }

    await tour.getByRole('button', { name: 'Close' }).click();
  }

  /**
   * Opens a p-select dropdown and picks the option with the given exact
   * text. The option list renders in an overlay appended outside the
   * dialog (via Angular CDK), so it's located from the page, not the dialog.
   */
  private async selectOption(trigger: Locator, optionText: string): Promise<void> {
    await trigger.click();
    await this.page.getByRole('option', { name: optionText, exact: true }).click();
  }

  async fillAndSave(entry: TimesheetEntry): Promise<void> {
    await this.dismissOnboardingTourIfPresent();
    await this.selectOption(this.tradingName, entry.tradingName);
    await this.selectOption(this.masterActivity, entry.masterActivity);
    await this.selectOption(this.task, entry.task);
    await this.selectOption(this.frequency, entry.frequency);
    await this.selectOption(this.period, entry.period);
    await this.selectOption(this.subActivity, entry.subActivity);
    await this.unitsInput.fill(String(entry.units));
    await this.notesTextarea.fill(entry.notes);
    await this.saveButton.click();
  }
}
