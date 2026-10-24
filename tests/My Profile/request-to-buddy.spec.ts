import { test } from '@playwright/test';
import { BefreeBuddyPage, BuddyRequestData } from '../../pages/BefreeBuddyPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > Ask your Buddy (Befree Buddy) > Request Contact
 *
 * Scenario 1 uses "Other" as the service type, Scenario 2 uses "Doctor"; the
 * rest of the form is the same. Scenario 1 is submitted as Urgent, Scenario 2
 * as Standard. Run as BUDDY_USER (default Nagnathg);
 * the password is common to all users (see utils/auth.ts).
 */
const USERNAME = process.env.BUDDY_USER ?? 'Nagnathg';

const request: BuddyRequestData = {
  service: 'Other',
  otherService: 'Test Automation',
  description: 'Test Automation [Please Ignore please this is Automation]',
  officeLocation: 'BCH - 15',
  preferredLocation: 'All Location',
  address: 'TEST Complex, NMG Road TestNg Gujrat [Please Ignore please this is Automation]',
  pincode: '382355',
  responseTime: 'Urgent',
};

const scenarios: { name: string; data: BuddyRequestData }[] = [
  { name: 'Scenario 1: Add request with service', data: request },
  // Scenario 2 picks the real service "Doctor", so there is no "If Other, please specify" field.
  { name: 'Scenario 2: Add request with Doctor service', data: { ...request, service: 'Doctor', otherService: undefined, responseTime: 'Standard' } },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.describe('My Profile - Request to Buddy', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const s of scenarios) {
    test(s.name, async ({ page }) => {
      const buddy = new BefreeBuddyPage(page);

      await buddy.open();
      await buddy.fill(s.data);
      await buddy.submit();

      console.log(`[${s.name}] success message: "${await buddy.expectSubmitted()}"`);
    });
  }
});
