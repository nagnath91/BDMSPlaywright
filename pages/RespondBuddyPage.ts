import { Page, Locator, expect } from '@playwright/test';

export interface BuddyRequestFilter {
  requester: string;
  service: string;
  priority: 'Urgent' | 'Standard';
  location: string;
}

export interface BuddyReplyData {
  contactPerson: string;
  businessName: string;
  phone: string;
  /** "Is this number also on WhatsApp?" - answered "No", so a separate number is needed. */
  whatsAppNumber: string;
  website: string;
  serviceType: string;
  officeAddress: string;
  /** Star ratings, 1-5. */
  reliable: number;
  expertise: number;
  expensive: number;
  feedback: string;
}

/**
 * My Profile > "Ask your Buddy" page > Quick Action "Respond to your buddy":
 * filter the incoming requests, press Reply and submit a recommendation.
 */
export class RespondBuddyPage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly quickActionButton: Locator;
  readonly table: Locator;
  readonly filterCells: Locator;
  readonly rows: Locator;
  readonly dialog: Locator;
  readonly submitButton: Locator;
  readonly confirmButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    // Icon-only orange button in the top bar whose tooltip reads "Respond to your buddy".
    this.quickActionButton = page.locator('button.p-button-warn.p-button-icon-only');
    this.table = page.locator('p-table table');
    // Second header row holds the column filters:
    // Index, Request ID, Requester, Service Needed, Priority, Request Date, Location, Status, Action.
    this.filterCells = this.table.locator('thead tr').nth(1).locator('th');
    this.rows = this.table.locator('tbody tr');
    this.dialog = page.getByRole('dialog', { name: /Submit Response/ });
    this.submitButton = this.dialog.getByRole('button', { name: 'Submit Recommendation' });
    this.confirmButton = page.getByRole('button', { name: 'Yes, Submit' });
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** My Profile -> Quick Action "Respond to your buddy". */
  async open(): Promise<void> {
    await this.profileMenu.click();
    await expect(this.quickActionButton).toBeVisible();
    await this.quickActionButton.click();
    await this.page.waitForURL(/\/my\/connection\/response/);
    await expect(this.table).toBeVisible();
  }

  private async pickFilterOption(column: number, option: string): Promise<void> {
    await this.filterCells.nth(column).getByRole('combobox').first().click();
    await this.page.getByRole('option', { name: option, exact: true }).first().click();
  }

  async applyFilters(f: BuddyRequestFilter): Promise<void> {
    await this.filterCells.nth(2).getByRole('textbox').fill(f.requester);
    await this.pickFilterOption(3, f.service);
    await this.pickFilterOption(4, f.priority);
    await this.pickFilterOption(6, f.location);

    // Every remaining row must match all four filters.
    const first = this.rows.first();
    await expect(first).toContainText(f.requester);
    await expect(first).toContainText(f.service);
    await expect(first).toContainText(f.priority);
    await expect(first).toContainText(f.location);
  }

  async openReply(): Promise<void> {
    await this.rows.first().getByRole('button', { name: 'Reply' }).click();
    await expect(this.dialog).toBeVisible();
  }

  async fillReply(d: BuddyReplyData): Promise<void> {
    const dlg = this.dialog;
    await dlg.locator('[formcontrolname="professional_name"]').fill(d.contactPerson);
    await dlg.locator('[formcontrolname="provider_name"]').fill(d.businessName);

    // Contact method: Phone Number. The checkbox id is duplicated by the
    // wrapper component, so target the real <input>.
    await dlg.locator('input#has_phone').check({ force: true });
    await dlg.locator('[formcontrolname="phone_number"]').fill(d.phone);

    // "Is this number also on WhatsApp?" -> No, then a WhatsApp number is asked.
    await dlg.locator('[formcontrolname="is_whatsapp_same_as_phone"]').getByText('No', { exact: true }).click();
    await dlg.locator('[formcontrolname="whatsApp_number"]').fill(d.whatsAppNumber);

    await dlg.locator('[formcontrolname="website"]').fill(d.website);
    await dlg.locator('[formcontrolname="specialization"]').fill(d.serviceType);
    await dlg.locator('#addressInput').fill(d.officeAddress);

    // The three rating rows are 5 clickable stars each, in the order Reliable, Expertise, Expensive
    // (the stars have no ids and only the last row is labelled).
    const stars = dlg.locator('i.cursor-pointer');
    await stars.nth(d.reliable - 1).click();
    await stars.nth(5 + d.expertise - 1).click();
    await stars.nth(10 + d.expensive - 1).click();

    await dlg.locator('[formcontrolname="feedback"]').fill(d.feedback);
  }

  /** Submit Recommendation, then "Yes, Submit" on the confirmation. */
  async submit(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
    await this.confirmButton.click();
  }

  /** Asserts the success message and that the reply dialog closes; returns the message text. */
  async expectSubmitted(timeout = 15000): Promise<string> {
    try {
      await expect(this.successToast.first()).toBeVisible({ timeout });
    } catch {
      const message = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Recommendation was not submitted${message ? `: ${message}` : ' (no success message shown)'}`);
    }
    const text = (await this.successToast.first().innerText()).trim();
    await expect(this.dialog).toBeHidden({ timeout });
    return text;
  }
}


