import { Page, Locator, expect } from '@playwright/test';
import { LeaveType } from './ApplyLeavePage';

export type LeaveDecision = 'Approve' | 'Reject';

/**
 * My Profile > My Leaves > "Pending For Approval" tab, filter by employee
 * and leave type, then approve / reject from the Action column.
 * All locators use the element ids exposed on the My Leaves listing page.
 */
export class LeaveApprovalPage {
  readonly page: Page;

  readonly profileMenu: Locator;
  readonly myLeavesLink: Locator;
  readonly table: Locator;
  readonly pendingTab: Locator;
  readonly filterButton: Locator;
  readonly employeeFilter: Locator;
  readonly leaveTypeFilter: Locator;
  readonly firstRow: Locator;
  readonly firstApprovalButton: Locator;

  readonly approvalForm: Locator;
  readonly commentBox: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;

  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileMenu = page.getByRole('link', { name: 'My Profile' }).first();
    this.myLeavesLink = page.getByRole('link', { name: 'My Leaves', exact: true });

    this.table = page.locator('#my-leaves-table');
    // The tab ids are numeric ("3" = Pending For Approval) so use an attribute selector.
    this.pendingTab = page.locator('#my-leaves-menu-tab a[id="3"]');
    this.filterButton = page.locator('#my-leaves-filter-btn');
    this.employeeFilter = page.locator('#my-leaves-column-filter-created_user');
    this.leaveTypeFilter = page.locator('#my-leaves-column-filter-leave_type');
    this.firstRow = page.locator('tr[id^="my-leaves-row-"]').first();
    this.firstApprovalButton = page.locator('[id^="my-leaves-approval-btn-"] button').first();

    this.approvalForm = page.locator('#leave-approval-form');
    this.commentBox = page.locator('#leave-approval-comment-textarea');
    this.approveButton = page.locator('#leave-approval-approve-btn');
    this.rejectButton = page.locator('#leave-approval-reject-btn');

    this.toast = page.locator('.p-toast-message');
  }

  async open(): Promise<void> {
    await this.profileMenu.click();
    await this.myLeavesLink.click();
    await this.page.waitForURL(/\/my\/leaves/);
    await expect(this.table).toBeVisible();
    await this.pendingTab.click();
    await expect(this.pendingTab.locator('xpath=ancestor::li')).toHaveClass(/p-tabmenuitem-active/);
  }

  /** Opens a column filter dropdown and picks `option` (types it into the search box first if present). */
  private async chooseFilterOption(filter: Locator, option: string): Promise<void> {
    await filter.click();
    const search = this.page.locator('input.p-select-filter');
    if (await search.isVisible().catch(() => false)) {
      await search.fill(option);
    }
    await this.page.getByRole('option', { name: option, exact: true }).first().click();
  }

  async applyFilter(employee: string, leaveType: LeaveType): Promise<void> {
    await this.filterButton.click();
    await expect(this.employeeFilter).toBeVisible();

    await this.chooseFilterOption(this.employeeFilter, employee);
    await expect(this.firstRow).toContainText(employee);

    await this.chooseFilterOption(this.leaveTypeFilter, leaveType);
    await expect(this.firstRow).toContainText(leaveType);
    await expect(this.firstRow).toContainText(employee);
  }

  /**
   * Clicks the Leave Approval action on the first filtered row, adds the
   * comment, presses Approve / Reject and asserts the success message.
   * Returns the success message text.
   */
  async decide(decision: LeaveDecision, comment = 'Test Automation'): Promise<string> {
    await expect(this.firstApprovalButton, 'Expected a pending leave with an approval action').toBeVisible();
    await this.firstApprovalButton.click();

    await expect(this.approvalForm).toBeVisible();
    await this.commentBox.fill(comment);
    await (decision === 'Approve' ? this.approveButton : this.rejectButton).click();

    const toast = this.toast.first();
    await expect(toast, `Expected a message after pressing ${decision}`).toBeVisible({ timeout: 15000 });
    const text = (await toast.innerText()).trim();
    if ((await toast.getAttribute('class'))?.includes('p-toast-message-error')) {
      throw new Error(`Leave was not ${decision.toLowerCase()}d: ${text}`);
    }

    await expect(this.approvalForm).toBeHidden({ timeout: 15000 });
    return text;
  }
}
