import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';

/** Dates used by the apply spec, read by the approval spec. */
export const TRAVEL_REQUESTS_FILE = path.join(__dirname, '..', 'data', 'travel-requests.json');

/** dd/mm/yyyy, the format the app shows in inputs and the grid. */
export function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type TravelType = 'Domestic' | 'International';

export interface TravelData {
  fromDate: Date;
  toDate: Date;
  travelType: TravelType;
  anythingDue: boolean;
  dueComment?: string;
  reason: string;
}

export class TravelRequestPage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly travelRequestLink: Locator;
  readonly applyTravelButton: Locator;
  readonly dialog: Locator;
  readonly calendar: Locator;
  readonly saveButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    this.travelRequestLink = page.getByRole('link', { name: 'Travel Request' });
    this.applyTravelButton = page.locator('#my-travel-apply-btn');
    this.dialog = page.getByRole('dialog', { name: 'Apply Travel' });
    this.calendar = page.getByRole('dialog', { name: 'Choose Date' });
    this.saveButton = this.dialog.locator('#apply-travel-submit-btn');
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** My Profile (side menu) -> Travel Request -> Apply Travel. */
  async open(): Promise<void> {
    await this.profileMenu.click();
    await this.travelRequestLink.click();
    await this.page.waitForURL(/\/my\/travel/);
    await this.applyTravelButton.click();
    await expect(this.dialog).toBeVisible();
  }

  /**
   * Picks a date through the calendar popup (typing does not update the form model).
   * Returns false, leaving the date unset, when the app disables that day
   * (already covered by an existing travel request).
   */
  async pickDate(field: 'from' | 'to', date: Date): Promise<boolean> {
    await this.dialog.locator(`#apply-travel-${field}-date-datepicker`).getByLabel('Choose Date').click();
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

    // data-date is "yyyy-m-d" with a 0-based month and no zero padding.
    const iso = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const day = this.calendar.locator(`td:not(.p-datepicker-other-month) span[data-date="${iso}"]`);
    await expect(day).toBeVisible();
    const blocked = await day.evaluate(el =>
      /disabled/.test(el.className) || el.getAttribute('aria-disabled') === 'true');
    if (blocked) {
      await this.page.keyboard.press('Escape');
      await expect(this.calendar).toBeHidden();
      return false;
    }
    await day.click();
    await expect(this.calendar).toBeHidden();
    return true;
  }

  async selectTravelType(type: TravelType): Promise<void> {
    await this.dialog.locator('#apply-travel-travel-type-select').getByText(type, { exact: true }).click();
  }

  async answerAnythingDue(yes: boolean): Promise<void> {
    await this.dialog
      .locator('xpath=.//label[contains(normalize-space(.), "anything due while you are on travel")]/following-sibling::p-selectbutton')
      .getByText(yes ? 'Yes' : 'No', { exact: true })
      .click();
  }

  async fillDueComment(text: string): Promise<void> {
    await this.dialog.locator('textarea[formcontrolname="anything_due_comments"]').fill(text);
  }

  async fillReason(text: string): Promise<void> {
    await this.dialog.locator('#apply-travel-travel-reason-textarea').fill(text);
  }

  get conflictMessage(): Locator {
    return this.dialog.getByText('already have a travel request');
  }

  /**
   * Fills and saves the form. If the app reports an existing travel request
   * in the chosen range (before or after Save), both dates move one week
   * forward and are re-picked until the range is free. Leaves the success
   * toast on screen; returns the dates finally used.
   */
  async apply(data: TravelData): Promise<{ from: Date; to: Date }> {
    await this.selectTravelType(data.travelType);
    await this.answerAnythingDue(data.anythingDue);
    if (data.anythingDue && data.dueComment) await this.fillDueComment(data.dueComment);
    await this.fillReason(data.reason);

    let from = data.fromDate;
    let to = data.toDate;
    for (let attempt = 0; attempt < 12; attempt++) {
      // To is picked first: the From calendar is capped at the current To, so a later From would be disabled.
      const picked = (await this.pickDate('to', to)) && (await this.pickDate('from', from));
      if (picked) await this.page.waitForTimeout(1500); // let the app validate the range

      if (picked && !(await this.conflictMessage.isVisible())) {
        await this.saveButton.click();
        const outcome = await Promise.race([
          this.successToast.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'saved' as const),
          this.conflictMessage.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'conflict' as const),
          this.errorToast.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error' as const),
        ]).catch(() => 'none' as const);

        if (outcome === 'saved') return { from, to };
        if (outcome === 'error') {
          const message = (await this.errorToast.first().innerText()).trim();
          throw new Error(`Travel request was not saved: ${message}`);
        }
        if (outcome === 'none') throw new Error('Travel request was not saved (no success message shown)');
      }

      from = new Date(from); from.setDate(from.getDate() + 7);
      to = new Date(to); to.setDate(to.getDate() + 7);
    }
    throw new Error('Could not find free dates for the travel request');
  }

  /**
   * Asserts the success message after Save and that the dialog closes;
   * throws with the error toast text if the app rejected the request.
   */
  async expectSaved(timeout = 15000): Promise<string> {
    await expect(this.successToast.first()).toBeVisible({ timeout });
    const text = (await this.successToast.first().innerText()).trim();
    await expect(this.dialog).toBeHidden({ timeout });
    return text;
  }

  // ---- Approval (grid filters + Travel Approval dialog) ----

  get filterButton(): Locator { return this.page.locator('#my-travel-filter-btn'); }
  get filterRow(): Locator { return this.page.locator('thead tr').nth(1).locator('th'); }
  get approvalDialog(): Locator { return this.page.getByRole('dialog', { name: 'Travel Approval' }); }

  /** Opens My Profile > Travel Request (no Apply Travel). */
  async openList(): Promise<void> {
    await this.profileMenu.click();
    await this.travelRequestLink.click();
    await this.page.waitForURL(/\/my\/travel/);
    await expect(this.applyTravelButton).toBeVisible();
  }

  /**
   * Filters the grid by employee, travel period ("Date Is Between" from/to,
   * dd/mm/yyyy) and travel type, then returns the single matching row.
   */
  async filterRequests(employee: string, from: string, to: string, type: TravelType): Promise<Locator> {
    const th = this.filterRow;
    if (!(await th.nth(2).getByLabel('dropdown trigger').isVisible())) {
      await this.filterButton.click();
    }

    await th.nth(2).getByLabel('dropdown trigger').click();
    await this.page.getByRole('option', { name: employee, exact: true }).click();

    const inputs = th.nth(3).locator('p-datepicker input');
    for (const [i, value] of [from, to].entries()) {
      const input = inputs.nth(i);
      await input.click();
      await input.pressSequentially(value, { delay: 30 });
      await input.press('Enter');
      await expect(input).toHaveValue(value);
    }

    await th.nth(4).getByLabel('dropdown trigger').click();
    await this.page.getByRole('option', { name: type, exact: true }).click();

    const rows = this.page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    const row = rows.first();
    await expect(row).toContainText(`${from} To ${to}`);
    await expect(row).toContainText(type);
    return row;
  }

  /** Clicks the Leave Approval icon in the Action column of the row. */
  async openApproval(row: Locator): Promise<void> {
    await row.locator('p-button[ptooltip="Leave Approval"] button').click();
    await expect(this.approvalDialog).toBeVisible();
  }

  /** Adds the comment, clicks Approve/Reject and returns the toast text. */
  async decide(decision: 'Approve' | 'Reject', comment: string): Promise<string> {
    await this.approvalDialog.locator('#travel-approval-comment-textarea').fill(comment);
    const id = decision === 'Approve' ? '#travel-approval-approve-btn' : '#travel-approval-reject-btn';
    await this.approvalDialog.locator(id).click();

    const toast = this.page.locator('.p-toast-message').first();
    await expect(toast).toBeVisible({ timeout: 15000 });
    const text = (await toast.innerText()).trim();
    await expect(this.approvalDialog).toBeHidden({ timeout: 15000 });
    return text;
  }}

