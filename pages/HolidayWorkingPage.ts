import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';

/** Sundays used by the apply spec, read by the approval spec. */
export const REQUESTS_FILE = path.join(__dirname, '..', 'data', 'holiday-requests.json');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface HolidayWorkingData {
  location: string;
  date: Date;
  arrivalTime: string;   // HH:mm
  departureTime: string; // HH:mm
  tradingName: string;
  reason: string;
}

/** dd/mm/yyyy, the format the app shows in the date input and the grid. */
export function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** The first Sunday strictly after today, pushed forward `extraWeeks` weeks. */
export function upcomingSunday(extraWeeks = 0): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (7 - d.getDay()) + extraWeeks * 7);
  return d;
}

export class HolidayWorkingPage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly holidayWorkingLink: Locator;
  readonly applyHolidayButton: Locator;
  readonly dialog: Locator;
  readonly calendar: Locator;
  readonly saveButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    this.holidayWorkingLink = page.getByRole('link', { name: 'My Holiday Working' });
    this.applyHolidayButton = page.getByRole('button', { name: 'Apply Holiday' });
    this.dialog = page.getByRole('dialog', { name: 'Apply Holiday Working' });
    this.calendar = page.getByRole('dialog', { name: 'Choose Date' });
    this.saveButton = this.dialog.locator('#apply-holiday-save-btn');
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** My Profile (side menu) -> My Holiday Working. */
  async open(): Promise<void> {
    await this.profileMenu.click();
    await this.holidayWorkingLink.click();
    await this.page.waitForURL(/\/my\/holiday-working/);
    await expect(this.applyHolidayButton).toBeVisible();
  }

  async openApplyDialog(): Promise<void> {
    await this.applyHolidayButton.click();
    await expect(this.dialog).toBeVisible();
  }

  private async selectOption(selectId: string, option: string): Promise<void> {
    await this.dialog.locator(selectId).getByLabel('dropdown trigger').click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  async selectLocation(location: string): Promise<void> {
    await this.selectOption('#apply-holiday-location-select', location);
  }

  async selectTradingName(name: string): Promise<void> {
    await this.selectOption('#apply-holiday-trading-name-select', name);
  }

  /** Picks the date through the calendar popup (typing does not update the form model). */
  async pickDate(date: Date): Promise<void> {
    await this.dialog.locator('#apply-holiday-date-datepicker').getByLabel('Choose Date').click();
    await expect(this.calendar).toBeVisible();

    const target = date.getFullYear() * 12 + date.getMonth();
    for (let i = 0; i < 36; i++) {
      const month = (await this.calendar.getByRole('button', { name: 'Choose Month' }).innerText()).trim();
      const year = Number((await this.calendar.getByRole('button', { name: 'Choose Year' }).innerText()).trim());
      const shown = year * 12 + MONTHS.indexOf(month);
      if (shown === target) break;
      await this.calendar
        .getByRole('button', { name: shown < target ? 'Next Month' : 'Previous Month' })
        .click();
    }

    await this.calendar
      .locator('td:not(.p-datepicker-other-month)')
      .getByText(String(date.getDate()), { exact: true })
      .click();
    await expect(this.calendar).toBeHidden();
  }

  /** Types an "HH:mm" time into a time picker input (this field accepts typed input). */
  async pickTime(pickerId: string, time: string): Promise<void> {
    const input = this.dialog.locator(pickerId).getByRole('combobox');
    await input.click();
    await input.pressSequentially(time, { delay: 30 });
    await input.press('Enter');
    await input.press('Tab');
    await expect(input).toHaveValue(time);
    await expect(this.dialog.locator(pickerId)).toHaveClass(/ng-valid/);
  }
  async fillReason(text: string): Promise<void> {
    await this.dialog.locator('#apply-holiday-reason-textarea').fill(text);
  }

  /**
   * Fills and saves the form. If the app rejects the date (e.g. a request
   * already exists for it) the date moves one week forward and the save is
   * retried. Returns the date finally used.
   */
  async apply(data: HolidayWorkingData): Promise<Date> {
    await this.selectLocation(data.location);
    await this.pickTime('#apply-holiday-start-time-datepicker', data.arrivalTime);
    await this.pickTime('#apply-holiday-end-time-datepicker', data.departureTime);
    await this.selectTradingName(data.tradingName);
    await this.fillReason(data.reason);

    let date = data.date;
    for (let attempt = 0; attempt < 8; attempt++) {
      await this.pickDate(date);
      await expect(this.saveButton).toBeEnabled();
      await this.saveButton.click();

      const result = await Promise.race([
        this.successToast.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'success' as const),
        this.errorToast.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error' as const),
      ]).catch(() => 'none' as const);

      if (result !== 'error') return date;

      await this.errorToast.first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      date = new Date(date);
      date.setDate(date.getDate() + 7);
    }
    throw new Error('Could not find a free Sunday for the holiday working request');
  }

  /** Asserts the success message and that the dialog closes; returns the message text. */
  async expectSaved(timeout = 15000): Promise<string> {
    await expect(this.successToast.first()).toBeVisible({ timeout });
    const text = (await this.successToast.first().innerText()).trim();
    await expect(this.dialog).toBeHidden({ timeout });
    return text;
  }

  // ---- Approval (grid filter + Holiday Approval dialog) ----

  get filterButton(): Locator { return this.page.locator('#my-holiday-working-filter-btn'); }
  get filterRow(): Locator { return this.page.locator('thead tr').nth(1).locator('th'); }
  get approvalDialog(): Locator { return this.page.getByRole('dialog', { name: 'Holiday Approval' }); }

  /**
   * Opens the inline filter row (Filter button) and filters by employee,
   * holiday date (dd/mm/yyyy) and status.
   */
  async filterRequests(employee: string, date: string, status: string): Promise<void> {
    const th = this.filterRow;
    if (!(await th.nth(1).getByLabel('dropdown trigger').isVisible())) {
      await this.filterButton.click();
    }

    await th.nth(1).getByLabel('dropdown trigger').click();
    await this.page.getByRole('option', { name: employee, exact: true }).click();

    const dateInput = th.nth(2).getByRole('combobox').first();
    await dateInput.click();
    await dateInput.pressSequentially(date, { delay: 30 });
    await dateInput.press('Enter');
    await expect(dateInput).toHaveValue(date);

    await th.nth(9).locator('p-multiselect').click();
    await this.page.getByRole('option', { name: status, exact: true }).click();
    await this.page.keyboard.press('Escape');

    const row = this.requestRow(employee, date, status);
    await expect(row).toBeVisible();
    await expect(this.page.locator('tbody tr')).toHaveCount(1);
  }

  requestRow(employee: string, date: string, status: string): Locator {
    return this.page.locator('tbody tr').filter({ hasText: employee }).filter({ hasText: date }).filter({ hasText: status });
  }

  /** Clicks "Holiday Approval" in the Action column of the filtered row. */
  async openApproval(employee: string, date: string, status: string): Promise<void> {
    await this.requestRow(employee, date, status).getByRole('button').last().click();
    await expect(this.approvalDialog).toBeVisible();
  }

  async decide(decision: 'Approve' | 'Reject', comment: string): Promise<string> {
    await this.approvalDialog.locator('#holiday-working-approval-comment-textarea').fill(comment);
    const id = decision === 'Approve' ? '#holiday-working-approval-approve-btn' : '#holiday-working-approval-reject-btn';
    await this.approvalDialog.locator(id).click();

    const toast = this.page.locator('.p-toast-message').first();
    await expect(toast).toBeVisible({ timeout: 15000 });
    const text = (await toast.innerText()).trim();
    await expect(this.approvalDialog).toBeHidden({ timeout: 15000 });
    return text;
  }}


