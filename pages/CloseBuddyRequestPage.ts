import { Page, Locator, expect } from '@playwright/test';

export type CloseFeedback =
  | 'Yes, I received a satisfactory response.'
  | 'Yes, I received a response, but it did not meet my requirements.'
  | 'No, I did not receive any response.';

/**
 * My Profile > Quick Action "My Request" (requester's own Befree Buddy
 * requests): filter by status, press "close request" and submit the feedback.
 */
export class CloseBuddyRequestPage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly myRequestButton: Locator;
  readonly filterButton: Locator;
  readonly statusFilter: Locator;
  readonly rows: Locator;
  readonly firstCloseButton: Locator;
  readonly dialog: Locator;
  readonly feedbackText: Locator;
  readonly submitButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    // Icon-only green button in the top bar whose tooltip reads "My Request".
    this.myRequestButton = page.locator('button.p-button-success.p-button-icon-only').first();
    // The app no longer exposes ids on this page, so locate controls by their icon / position.
    this.filterButton = page.locator('button:has(.pi-filter)');
    // Second header row = column filters; Status is the 9th column (Index, Request ID, Requester,
    // Service Needed, Location, Date, Timeline, Responses, Status, Action).
    this.statusFilter = page.locator('thead tr').nth(1).locator('th').nth(8).locator('p-multiselect');
    this.rows = page.locator('tbody tr');
    this.firstCloseButton = this.rows.locator('button:has(.pi-times)').first();
    this.dialog = page.getByRole('dialog', { name: /Close Request/ });
    this.feedbackText = this.dialog.locator('textarea[formcontrolname="feedbackText"]');
    this.submitButton = this.dialog.getByRole('button', { name: 'Submit & Close Request' });
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** My Profile -> Quick Action "My Request". */
  async open(): Promise<void> {
    await this.profileMenu.click();
    await expect(this.myRequestButton).toBeVisible();
    await this.myRequestButton.click();
    await this.page.waitForURL(/\/my\/connection$/);
    await expect(this.rows.first()).toBeVisible();
  }

  /** Shows the column filters and keeps only requests with the given status. */
  async filterByStatus(status: 'Active' | 'Pending' | 'Closed' | 'Cancelled'): Promise<void> {
    await this.filterButton.click();
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: status, exact: true }).click();
    await this.page.keyboard.press('Escape');

    // Every remaining row must have that status (the grid reloads asynchronously).
    await expect(this.rows.first()).toContainText(status);
    await expect(this.rows.filter({ hasNotText: status })).toHaveCount(0);
  }

  /** Clicks the close-request action of the first row and returns its request id. */
  async openCloseRequest(): Promise<string> {
    await expect(
      this.firstCloseButton,
      'Expected an Active request with a close-request action (a previous run may already have closed it)'
    ).toBeVisible();
    await this.firstCloseButton.click();
    await expect(this.dialog).toBeVisible();
    return ((await this.dialog.getByText(/SR\d+/).first().innerText()).match(/SR\d+/) ?? [''])[0];
  }

  async fillFeedback(option: CloseFeedback, comment: string): Promise<void> {
    await this.dialog.getByRole('radio', { name: option }).check({ force: true });
    await this.feedbackText.fill(comment);
  }

  async submit(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  /** Asserts the success message and that the dialog closes; returns the message text. */
  async expectClosed(timeout = 15000): Promise<string> {
    try {
      await expect(this.successToast.first()).toBeVisible({ timeout });
    } catch {
      const message = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Request was not closed${message ? `: ${message}` : ' (no success message shown)'}`);
    }
    const text = (await this.successToast.first().innerText()).trim();
    await expect(this.dialog).toBeHidden({ timeout });
    return text;
  }
}

