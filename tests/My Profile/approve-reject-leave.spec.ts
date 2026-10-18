import { test } from '@playwright/test';
import { LeaveApprovalPage, LeaveDecision } from '../../pages/LeaveApprovalPage';
import { LeaveType, ONCE_A_YEAR_LEAVES } from '../../pages/ApplyLeavePage';
import { loginAs, logout } from '../../utils/auth';

/**
 * Approve / Reject leave workflow, run as the approver.
 *
 * Prerequisite: run apply-leave.spec.ts first - it creates two pending
 * leaves of each type for "Nagnath Gejage" (one to approve, one to reject).
 *
 * Change APPROVER_USER to use a different approver; the password is common
 * to all users (see utils/auth.ts).
 */
const APPROVER = process.env.APPROVER_USER ?? 'Dilip';
const EMPLOYEE = 'Darshan Trivedi';

const leaveTypes: LeaveType[] = ['Casual', 'Comp-off', 'Sick', 'Maternity', 'Residential Program Leave'];
const decisions: LeaveDecision[] = ['Approve', 'Reject'];

test.describe.configure({ mode: 'serial' });

test.describe('My Profile - Approve / Reject Leave', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, APPROVER);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  leaveTypes.forEach((leaveType, i) => {
    for (const decision of decisions) {
      test(`Scenario ${i + 1}: ${decision} ${leaveType} leave`, async ({ page }) => {
        const approval = new LeaveApprovalPage(page);

        await approval.open();

        if (ONCE_A_YEAR_LEAVES.includes(leaveType)) {
          // Once-a-year leave: the employee may not have a pending request
          // (already taken this year, so none was applied). Nothing to
          // approve / reject then - the test passes.
          const found = await approval.applyFilter(EMPLOYEE, leaveType).then(() => true, () => false);
          if (!found) {
            console.log(`[${decision} ${leaveType}] no pending leave (already taken this year) - test passes`);
            return;
          }
        } else {
          await approval.applyFilter(EMPLOYEE, leaveType);
        }

        const message = await approval.decide(decision, 'Test Automation');
        console.log(`[${decision} ${leaveType}] success message: "${message}"`);
      });
    }
  });
});
