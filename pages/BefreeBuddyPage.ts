import { Page, Locator, expect } from '@playwright/test';

export interface BuddyRequestData {
  /** Option picked in "What service or type of contact are you looking for?". */
  service: string;
  /** Free text, only asked when `service` is "Other". */
  otherService?: string;
  description: string;
  officeLocation: string;
  preferredLocation: string;
  address: string;
  pincode: string;
  responseTime: 'Urgent' | 'Standard';
}

/** My Profile > "Ask your Buddy" > Request Contact dialog. */
export class BefreeBuddyPage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly askBuddyButton: Locator;
  readonly dialog: Locator;
  readonly serviceType: Locator;
  readonly otherServiceInput: Locator;
  readonly description: Locator;
  readonly officeLocation: Locator;
  readonly preferredLocation: Locator;
  readonly address: Locator;
  readonly pincode: Locator;
  readonly urgentRadio: Locator;
  readonly standardRadio: Locator;
  readonly submitButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    this.askBuddyButton = page.getByRole('button', { name: /Ask your Buddy/i });
    this.dialog = page.getByRole('dialog', { name: 'Request Contact' });
    this.serviceType = this.dialog.locator('#serviceType');
    // The app no longer exposes element ids for these fields, so use the placeholders / radio labels.
    this.otherServiceInput = this.dialog.getByPlaceholder('Enter service name');
    this.description = this.dialog.getByPlaceholder('Describe your requirements in detail...');
    this.officeLocation = this.dialog.locator('p-select[formcontrolname="service_location"]');
    this.preferredLocation = this.dialog.locator('p-multiselect[formcontrolname="preferred_location"]');
    this.address = this.dialog.locator('#addressInput');
    this.pincode = this.dialog.locator('#pincodeInput');
    this.urgentRadio = this.dialog.getByRole('radio', { name: /^Urgent/ });
    this.standardRadio = this.dialog.getByRole('radio', { name: /^Standard/ });
    this.submitButton = this.dialog.getByRole('button', { name: 'Submit Request' });
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** My Profile (side menu) -> "Ask your Buddy". */
  async open(): Promise<void> {
    await this.profileMenu.click();
    await this.askBuddyButton.click();
    // Slower browsers (Firefox) take longer than the default 5s to load the dialog.
    await expect(this.dialog).toBeVisible({ timeout: 20000 });
  }

  private async choose(dropdown: Locator, option: string): Promise<void> {
    await dropdown.click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  async fill(data: BuddyRequestData): Promise<void> {
    await this.choose(this.serviceType, data.service);
    if (data.service === 'Other') {
      await this.otherServiceInput.fill(data.otherService ?? '');
    }
    await this.description.fill(data.description);

    await this.choose(this.officeLocation, data.officeLocation);

    // Multi-select: tick the option, then close the panel so it doesn't cover the form.
    await this.preferredLocation.click();
    // The app spells it "ALL Location", so match case-insensitively.
    await this.page.getByRole('option', { name: new RegExp(`^${data.preferredLocation}$`, 'i') }).click();
    await this.page.keyboard.press('Escape');

    await this.address.fill(data.address);
    await this.pincode.fill(data.pincode);

    // The real <input> is visually hidden behind the card, so tick it directly.
    await (data.responseTime === 'Urgent' ? this.urgentRadio : this.standardRadio).check({ force: true });
  }

  async submit(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  /**
   * Asserts the success message appears after Submit and the dialog closes;
   * throws with the error toast text if the request was rejected.
   * Returns the success message text.
   */
  async expectSubmitted(timeout = 15000): Promise<string> {
    try {
      await expect(this.successToast.first()).toBeVisible({ timeout });
    } catch {
      const message = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Buddy request was not submitted${message ? `: ${message}` : ' (no success message shown)'}`);
    }
    const text = (await this.successToast.first().innerText()).trim();
    await expect(this.dialog).toBeHidden({ timeout });
    return text;
  }
}
