import { Page, Locator } from '@playwright/test';

/**
 * The top-bar "Units" button (ptooltip="Units") opens a small panel with
 * today's Date/Punch In/Time Spent/Unit summary and a "Punch out" action.
 */
export class PunchClock {
  readonly page: Page;
  readonly unitsButton: Locator;
  readonly punchOutButton: Locator;
  /** Exact wording from the spec: a confirmation button reading "Yes, Punch out". */
  readonly punchOutConfirmButton: Locator;
  readonly outTimeLabel: Locator;
  /** Shown in the Units panel instead of the button once already punched out today. */
  readonly alreadyPunchedOutLabel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.unitsButton = page.locator('button[ptooltip="Units"]');
    this.punchOutButton = page.getByRole('button', { name: 'Punch out' });
    this.punchOutConfirmButton = page.getByRole('button', { name: /yes,?\s*punch out/i });
    // Not anchored: the header renders "In: HH:MM:SS Out: HH:MM:SS" as a single
    // text node, so "Out:" never starts that node's text.
    this.outTimeLabel = page.getByText(/Out:\s*\d/);
    this.alreadyPunchedOutLabel = page.getByText(/^Punch Out\s*:/);
  }

  async open(): Promise<void> {
    await this.unitsButton.click();
  }

  /**
   * Clicks "Punch out" and resolves the confirmation step. Some accounts
   * also surface an unrelated "ticket resolved, please rate" popup around
   * this action (an IT helpdesk notification, nothing to do with punching
   * out); it's dismissed if present so it doesn't block the real flow.
   * Then, if the app shows a "Yes, Punch out" confirmation, it's clicked;
   * if the app punches out directly (no confirmation), that's accepted too.
   */
  async punchOut(timeout = 15000): Promise<void> {
    type Initial = 'button' | 'already-out' | null;
    const initial = await Promise.race<Initial>([
      this.punchOutButton
        .waitFor({ state: 'visible', timeout })
        .then<Initial>(() => 'button')
        .catch(() => null),
      this.alreadyPunchedOutLabel
        .waitFor({ state: 'visible', timeout })
        .then<Initial>(() => 'already-out')
        .catch(() => null),
    ]);

    if (initial === 'already-out') {
      // Rerunning for a user who already punched out today - nothing to do.
      return;
    }
    if (initial !== 'button') {
      throw new Error(
        'Punch out panel did not show a "Punch out" button or an existing punch-out time.'
      );
    }

    await this.punchOutButton.click();
    await this.dismissStrayTicketPopupIfPresent();

    type Result = 'confirm' | 'done' | null;
    const result = await Promise.race<Result>([
      this.punchOutConfirmButton
        .waitFor({ state: 'visible', timeout })
        .then<Result>(() => 'confirm')
        .catch(() => null),
      this.outTimeLabel
        .waitFor({ state: 'visible', timeout })
        .then<Result>(() => 'done')
        .catch(() => null),
    ]);

    if (result === 'confirm') {
      await this.punchOutConfirmButton.click();
      await this.outTimeLabel.waitFor({ state: 'visible', timeout });
    } else if (result === null) {
      throw new Error('Punch out did not complete: neither the "Out:" time nor a confirmation button appeared.');
    }
  }

  private async dismissStrayTicketPopupIfPresent(timeout = 3000): Promise<void> {
    const ticketDialog = this.page
      .getByRole('alertdialog', { name: 'Are you sure?' })
      .filter({ hasText: 'ticket' });

    try {
      await ticketDialog.waitFor({ state: 'visible', timeout });
    } catch {
      return;
    }

    await ticketDialog.getByRole('button', { name: 'No' }).click();
  }
}
