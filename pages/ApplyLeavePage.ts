import { Page, Locator, expect } from '@playwright/test';

/**
 * NOTE: 'Residential Program Leave' is an access-right based leave type. It is
 * only listed in the Leave Type dropdown for users who have that access right;
 * for any other user the option does not appear at all.
 */
export type LeaveType =
  | 'Casual'
  | 'Comp-off'
  | 'Sick'
  | 'Maternity'
  | 'Residential Program Leave';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Thrown when the app refuses a once-a-year leave because it was already taken. */
export class LeaveAlreadyTakenError extends Error {}

/** Leave types a user can take only once in a year. */
export const ONCE_A_YEAR_LEAVES: LeaveType[] = ['Residential Program Leave'];

export interface ApplyLeaveData {
  leaveType: LeaveType;
  fromDate: Date;
  toDate: Date;
  comment: string;
  reason: string;
}

export class ApplyLeavePage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly myLeavesLink: Locator;
  readonly applyLeaveButton: Locator;
  readonly dialog: Locator;
  readonly calendar: Locator;
  readonly saveButton: Locator;
  readonly errorToast: Locator;
  readonly successToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    this.myLeavesLink = page.getByRole('link', { name: 'My Leaves', exact: true });
    this.applyLeaveButton = page.getByRole('button', { name: 'Apply Leave' });
    this.dialog = page.getByRole('dialog', { name: 'Apply Leave' });
    this.calendar = page.getByRole('dialog', { name: 'Choose Date' });
    this.saveButton = this.dialog.getByRole('button', { name: 'Save' });
    this.errorToast = page.locator('.p-toast-message-error');
    this.successToast = page.locator('.p-toast-message-success');
  }

  /** My Profile (side menu) -> My Leaves -> Apply Leave. */
  async open(): Promise<void> {
    await this.goToMyLeaves();
    await this.openDialog();
  }

  async goToMyLeaves(): Promise<void> {
    await this.profileMenu.click();
    await this.myLeavesLink.click();
    await this.page.waitForURL(/\/my\/leaves/);
  }

  async openDialog(): Promise<void> {
    await this.applyLeaveButton.click();
    await expect(this.dialog).toBeVisible();
  }

  /**
   * Once-a-year leave types (e.g. 'Residential Program Leave'): true when the
   * My Leaves listing already has a leave of this type in `year` (default: this year)
   * that was not rejected / cancelled. Call after goToMyLeaves().
   */
  async hasTakenInYear(type: LeaveType, year: number = new Date().getFullYear()): Promise<boolean> {
    const rows = this.page.locator('tr[id^="my-leaves-row-"]').filter({ hasText: type });
    await this.page.waitForLoadState('networkidle').catch(() => {});
    const texts = await rows.allInnerTexts();
    return texts.some((t) => t.includes(String(year)) && !/reject|cancel/i.test(t));
  }

  /** Wording of the app's "only once in a year" rejection (safety net if the listing check misses it). */
  static readonly ANNUAL_LIMIT_TEXT =
    /once (in|a|per) (a |the )?year|already (taken|availed|utili[sz]ed)|yearly limit|annual limit/i;

  async selectLeaveType(type: LeaveType): Promise<void> {
    await this.dialog.getByLabel('dropdown trigger').first().click();
    const option = this.page.getByRole('option', { name: type, exact: true });
    // Access-right based leave types (e.g. 'Residential Program Leave') are
    // hidden from the dropdown when the user lacks the access right, so fail
    // with a clear message instead of a generic locator timeout.
    try {
      await option.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      throw new Error(
        `Leave type "${type}" is not available in the dropdown - the user probably does not have the access right for it`
      );
    }
    await option.click();
  }

  /**
   * Picks a date through the PrimeNG calendar popup. Typing into the input
   * does not update the form model, so the calendar must be clicked.
   */
  async pickDate(field: 'From Date' | 'To Date', date: Date): Promise<void> {
    await this.dialog
      .locator('p-floatlabel')
      .filter({ hasText: field })
      .getByLabel('Choose Date')
      .click();
    await expect(this.calendar).toBeVisible();

    const targetIndex = date.getFullYear() * 12 + date.getMonth();
    for (let i = 0; i < 36; i++) {
      const month = (await this.calendar.getByRole('button', { name: 'Choose Month' }).innerText()).trim();
      const year = Number((await this.calendar.getByRole('button', { name: 'Choose Year' }).innerText()).trim());
      const shownIndex = year * 12 + MONTHS.indexOf(month);
      if (shownIndex === targetIndex) break;
      const step = shownIndex < targetIndex ? 1 : -1;
      await this.calendar
        .getByRole('button', { name: step === 1 ? 'Next Month' : 'Previous Month' })
        .click();
      // Wait until the header really shows the new month. Reading it too early
      // (stale value) makes long jumps - e.g. next year - overshoot the target.
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

  /** Clicks "Yes" on one of the Yes/No question rows (matched by label text). */
  async answerYes(question: string): Promise<void> {
    await this.dialog
      .locator(`xpath=.//label[contains(normalize-space(.), "${question}")]/following-sibling::p-selectbutton`)
      .getByText('Yes', { exact: true })
      .click();
  }

  /** Ensures "Full Day" is selected for every date row (the default). */
  async selectFullDayForAllDates(): Promise<void> {
    const fullDay = this.dialog.locator('p-togglebutton').filter({ hasText: 'Full Day' });
    const count = await fullDay.count();
    for (let i = 0; i < count; i++) {
      const toggle = fullDay.nth(i);
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
        await toggle.click();
      }
    }
  }

  async fillComment(text: string): Promise<void> {
    await this.dialog
      .locator('p-floatlabel')
      .filter({ hasText: 'If due' })
      .getByRole('textbox')
      .fill(text);
  }

  async fillReason(text: string, type?: LeaveType): Promise<void> {
    // Only 'Residential Program Leave' labels this field "Program details";
    // every other leave type uses "Reason for Leave".
    const label = type === 'Residential Program Leave' ? 'Program details' : 'Reason for Leave';
    await this.dialog
      .locator('p-floatlabel')
      .filter({ hasText: label })
      .getByRole('textbox')
      .fill(text);
  }

  /** Wording the app uses when a date already has a leave (inline message or error toast). */
  private static readonly CONFLICT_TEXT =
    /already (have|applied|exist)|leave request.*(exist|overlap)|overlap|existing leave/i;

  /** True when the app flags the chosen range as overlapping an existing leave. */
  async hasDateConflict(): Promise<boolean> {
    await this.page.waitForTimeout(700);
    return this.dialog.getByText(ApplyLeavePage.CONFLICT_TEXT).first().isVisible();
  }

  /**
   * Picks From/To dates; if the app reports an existing leave in that range,
   * shifts both forward a week and retries so no two leaves share a date.
   * Returns the dates finally used.
   */
  async pickNonConflictingDates(from: Date, to: Date): Promise<{ from: Date; to: Date }> {
    for (let attempt = 0; attempt < 8; attempt++) {
      await this.pickDate('From Date', from);
      await this.pickDate('To Date', to);
      if (!(await this.hasDateConflict())) return { from, to };

      from = new Date(from); from.setDate(from.getDate() + 7);
      to = new Date(to); to.setDate(to.getDate() + 7);
    }
    throw new Error('Could not find a free date range for the leave');
  }

  async apply(data: ApplyLeaveData, options: { fullDay?: boolean } = {}): Promise<void> {
    const { fullDay = true } = options;

    await this.selectLeaveType(data.leaveType);

    let from = data.fromDate;
    let to = data.toDate;
    for (let attempt = 0; attempt < 8; attempt++) {
      // 1st check: the inline "already have a leave request" message after picking dates.
      ({ from, to } = await this.pickNonConflictingDates(from, to));
      if (fullDay) await this.selectFullDayForAllDates();

      await this.answerYes('Have you inform to team incharge');
      await this.answerYes('Did you check weekly task list');
      await this.answerYes('Was there anything due while you are on leave');
      await this.fillComment(data.comment);
      await this.fillReason(data.reason, data.leaveType);

      await expect(this.saveButton).toBeEnabled();
      await this.saveButton.click();

      // 2nd check: the server may still reject the save because a leave is
      // already applied for one of the dates. If so, move to the next free week.
      const outcome = await Promise.race([
        this.successToast.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'saved' as const),
        this.errorToast.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error' as const),
      ]).catch(() => 'none' as const);

      if (outcome !== 'error') return; // expectSaved() reports success / missing message
      const message = (await this.errorToast.first().innerText()).trim();      if (ApplyLeavePage.ANNUAL_LIMIT_TEXT.test(message)) throw new LeaveAlreadyTakenError(message);
      if (!ApplyLeavePage.CONFLICT_TEXT.test(message)) return; // other error - expectSaved() reports it

      from = new Date(from); from.setDate(from.getDate() + 7);
      to = new Date(to); to.setDate(to.getDate() + 7);
      await this.errorToast.first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }
    throw new Error('Could not find a free date range for the leave');
  }

  /**
   * Asserts the success message appears after Save and the dialog closes;
   * throws with the error toast text if the app rejected the leave.
   * Returns the success message text.
   */
  async expectSaved(timeout = 15000): Promise<string> {
    try {
      await expect(this.successToast.first()).toBeVisible({ timeout });
    } catch {
      const message = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Leave was not saved${message ? `: ${message}` : ' (no success message shown)'}`);
    }
    const text = (await this.successToast.first().innerText()).trim();
    await expect(this.dialog).toBeHidden({ timeout });
    return text;
  }
}

