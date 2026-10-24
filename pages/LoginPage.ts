import { Page, Locator, expect } from '@playwright/test';

export type LoginOutcome = 'success' | 'error';

export class LoginPage {
  readonly page: Page;

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly termsCheckbox: Locator;
  readonly loginButton: Locator;
  readonly errorToast: Locator;
  readonly workLocationDialog: Locator;
  readonly workLocationSaveButton: Locator;
  readonly leaveConfirmYesButton: Locator;

  static readonly URL = 'http://10.10.20.41/auth/login';
  static readonly DASHBOARD_URL_PATTERN = /\/my\/dashboard/;

  constructor(page: Page) {
    this.page = page;

    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('input[type="password"]');
    this.rememberMeCheckbox = page.locator('#remember');
    this.termsCheckbox = page.locator('#terms');
    this.loginButton = page.locator('button.login-submit');
    // PrimeNG toasts use role="alert" for both success and error messages;
    // ".p-toast-message-error" is the severity-specific class that only
    // appears on failed-login toasts (e.g. bad credentials, disabled account).
    this.errorToast = page.locator('.p-toast-message-error');
    // On a user's first login of the day the app interrupts the redirect to
    // the dashboard with a "Work Location" modal that must be dismissed.
    this.workLocationDialog = page.getByRole('dialog', { name: 'Work Location' });
    this.workLocationSaveButton = this.workLocationDialog.getByRole('button', { name: 'Save Location' });
    // Leave confirmation pop-up (24th-26th of the month): confirm with "Yes".
    this.leaveConfirmYesButton = page
      .locator('[role="dialog"], [role="alertdialog"]')
      .filter({ hasText: /leave/i })
      .getByRole('button', { name: /^\s*yes\s*$/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(LoginPage.URL);
  }

  /**
   * Fills the login form and submits it. Does not wait for the
   * resulting navigation/toast - use loginAndWaitForOutcome() for that.
   */
  async login(
    username: string,
    password: string,
    options: { acceptTerms?: boolean; rememberMe?: boolean } = {}
  ): Promise<void> {
    const { acceptTerms = true, rememberMe = false } = options;

    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);

    if (rememberMe && !(await this.rememberMeCheckbox.isChecked())) {
      await this.rememberMeCheckbox.check();
    }

    if (acceptTerms && !(await this.termsCheckbox.isChecked())) {
      await this.termsCheckbox.check();
    }

    await this.loginButton.click();
  }

  /**
   * Submits the login form and waits for the login to resolve: either a
   * successful redirect to the dashboard or an error toast. Also handles
   * the one-time "Work Location" dialog that can appear first on a user's
   * first login of the day, dismissing it and then waiting again.
   */
  async loginAndWaitForOutcome(
    username: string,
    password: string,
    timeout = 15000
  ): Promise<LoginOutcome> {
    await this.login(username, password);
    const outcome = await this.waitForLoginOutcome(timeout);

    // On a user's very first login the app can bounce back to the login page
    // while the Work Location dialog is being saved (the session is not ready
    // yet). Sign in once more - the location is already saved, so it goes through.
    if (outcome === 'error' && this.isOnLoginPage() && !(await this.errorToast.isVisible().catch(() => false))) {
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.login(username, password);
      return this.waitForLoginOutcome(timeout);
    }
    return outcome;
  }

  /**
   * Dismisses the "Work Location" dialog. On the first login the "Save
   * Location" button is disabled / in a loading state while the app fetches the
   * location, so wait until it is really clickable before pressing it. A click
   * that races a navigation (dialog detached) is not an error - the caller
   * re-checks the outcome afterwards.
   */
  private async dismissWorkLocation(timeout: number): Promise<void> {
    try {
      await expect(this.workLocationSaveButton).toBeEnabled({ timeout });
      await expect(this.workLocationSaveButton).not.toHaveClass(/p-button-loading/, { timeout });
      await this.workLocationSaveButton.click({ timeout });
    } catch {
      // Dialog disappeared / page navigated while clicking - fall through.
    }
  }

  private async waitForLoginOutcome(timeout: number): Promise<LoginOutcome> {
    type RaceResult = LoginOutcome | 'work-location' | null;

    const result = await Promise.race<RaceResult>([
      this.page
        .waitForURL(LoginPage.DASHBOARD_URL_PATTERN, { timeout })
        .then<RaceResult>(() => 'success')
        .catch(() => null),
      this.errorToast
        .waitFor({ state: 'visible', timeout })
        .then<RaceResult>(() => 'error')
        .catch(() => null),
      this.workLocationDialog
        .waitFor({ state: 'visible', timeout })
        .then<RaceResult>(() => 'work-location')
        .catch(() => null),
    ]);

    if (result === 'work-location') {
      await this.dismissWorkLocation(timeout);
      return this.waitForLoginOutcome(timeout);
    }

    if (result === 'success') await this.confirmLeavePopup();

    return result ?? 'error';
  }

  /**
   * On the 24th, 25th and 26th of every month the app shows a leave
   * confirmation pop-up after login that must be answered with "Yes". It does
   * not appear every time (or on other days), so click "Yes" only when it
   * shows up; otherwise carry on after a short wait.
   */
  private async confirmLeavePopup(timeout = 4000): Promise<void> {
    try {
      await this.leaveConfirmYesButton.waitFor({ state: 'visible', timeout });
      await this.leaveConfirmYesButton.click({ timeout: 5000 });
      await this.leaveConfirmYesButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    } catch {
      // Pop-up not shown (or closed by itself) - nothing to confirm.
    }
  }

  async getErrorMessage(): Promise<string | null> {
    if (await this.errorToast.isVisible().catch(() => false)) {
      return (await this.errorToast.innerText()).trim();
    }
    return null;
  }

  isOnLoginPage(): boolean {
    return this.page.url().includes('/auth/login');
  }
}
