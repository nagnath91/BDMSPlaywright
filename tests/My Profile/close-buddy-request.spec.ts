import { test } from '@playwright/test';
import { CloseBuddyRequestPage } from '../../pages/CloseBuddyRequestPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > Quick Action "My Request" > Close request
 *
 * Closes the requester's first Active Befree Buddy request with the
 * "satisfactory response" feedback. Run request-to-buddy.spec.ts first so
 * there is an Active request; a request is Active once a buddy has responded
 * (respond-to-buddy.spec.ts), and each run closes one.
 *
 * Change BUDDY_USER to close as another user; the password is common to all
 * users (see utils/auth.ts).
 */
const USERNAME = process.env.BUDDY_USER ?? 'Nagnathg';

test.setTimeout(120000);

test.describe('My Profile - Close Buddy Request', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('Scenario 5: Close an Active request - satisfactory response', async ({ page }) => {
    const buddy = new CloseBuddyRequestPage(page);

    await buddy.open();
    await buddy.filterByStatus('Active');
    const requestId = await buddy.openCloseRequest();
    await buddy.fillFeedback('Yes, I received a satisfactory response.', 'Thanks for Help');
    await buddy.submit();

    console.log(`[Close ${requestId}] success message: "${await buddy.expectClosed()}"`);
  });
});
