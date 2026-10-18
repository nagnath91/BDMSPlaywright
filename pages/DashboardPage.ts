import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;

  readonly dashboardHeading: Locator;
  readonly userMenuButton: Locator;
  readonly logoutMenuItem: Locator;
  readonly addOptionsButton: Locator;
  readonly addTimesheetMenuItem: Locator;

  static readonly LOGIN_URL_PATTERN = /\/auth\/login/;

  constructor(page: Page) {
    this.page = page;

    this.dashboardHeading = page.getByRole('heading', { name: 'My Dashboard' });
    this.userMenuButton = page.locator('button:has(img[alt="avatar"])');
    this.logoutMenuItem = page.locator('li[role="menuitem"]:has-text("Logout")');
    // Top bar controls - present on every authenticated page, not just the dashboard.
    this.addOptionsButton = page.locator('button[ptooltip="Add Options"]');
    this.addTimesheetMenuItem = page.locator('li[role="menuitem"]:has-text("Add Timesheet")');
  }

  isLoaded(): boolean {
    return this.page.url().includes('/my/dashboard');
  }

  /**
   * Opens the avatar/profile menu and clicks "Logout", then waits
   * for the app to redirect back to the login page.
   */
  async logout(timeout = 15000): Promise<void> {
    await this.userMenuButton.click();
    await this.logoutMenuItem.click();
    await this.page.waitForURL(DashboardPage.LOGIN_URL_PATTERN, { timeout });
  }

  /**
   * Opens the green "Add Options" menu (top right, beside the avatar)
   * and clicks "Add Timesheet", leaving the Add Timesheet dialog open.
   *
   * Not every role has this option (e.g. some approver/manager roles only
   * see "Today's Timesheet" / "Worksheet" in this menu, no "Add Timesheet"),
   * so this fails fast with a clear message instead of hanging until the
   * test timeout when the item simply isn't there for that account.
   */
  async openAddTimesheetDialog(timeout = 10000): Promise<void> {
    await this.addOptionsButton.click();

    try {
      await this.addTimesheetMenuItem.waitFor({ state: 'visible', timeout });
    } catch {
      throw new Error(
        '"Add Timesheet" is not available in the Add Options menu for this user (role-based menu difference).'
      );
    }

    await this.addTimesheetMenuItem.click();
  }
}
