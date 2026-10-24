import { test } from '@playwright/test';
import { RespondBuddyPage, BuddyRequestFilter, BuddyReplyData } from '../../pages/RespondBuddyPage';
import { loginAs, logout } from '../../utils/auth';

/**
 * My Profile > Quick Action "Respond to your buddy"
 *
 * Replies, as the buddy, to the requests that tests/My Profile/befree-buddy.spec.ts
 * raised as Nagnath Gejage: Scenario 3 answers the Doctor / Standard request,
 * Scenario 4 the Other / Urgent request. Run befree-buddy.spec.ts first.
 *
 * Change BUDDY_RESPONDER to reply as another user; the password is common to
 * all users (see utils/auth.ts).
 */
const USERNAME = process.env.BUDDY_RESPONDER ?? 'Pankajn';

const reply: BuddyReplyData = {
  contactPerson: 'TEST Clinic',
  businessName: 'TEST Auto',
  phone: '9876543210',
  whatsAppNumber: '9876543211',
  website: 'WWW.AAA.COM',
  serviceType: 'clinic 1',
  officeAddress: 'TestNg Gujrat [Please Ignore please this is Automation]',
  reliable: 3,
  expertise: 4,
  expensive: 5,
  feedback: 'Please Ignore please this is Automation',
};

const scenarios: { name: string; filter: BuddyRequestFilter }[] = [
  {
    name: 'Scenario 3: Respond to buddy - Doctor, Standard',
    filter: { requester: 'Nagnath Gejage', service: 'Doctor', priority: 'Standard', location: 'BCH - 15' },
  },
  {
    name: 'Scenario 4: Respond to buddy - Other, Urgent',
    filter: { requester: 'Nagnath Gejage', service: 'Other', priority: 'Urgent', location: 'BCH - 15' },
  },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.describe('My Profile - Respond to your Buddy', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERNAME);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const s of scenarios) {
    test(s.name, async ({ page }) => {
      const buddy = new RespondBuddyPage(page);

      await buddy.open();
      await buddy.applyFilters(s.filter);
      await buddy.openReply();
      await buddy.fillReply(reply);
      await buddy.submit();

      console.log(`[${s.name}] success message: "${await buddy.expectSubmitted()}"`);
    });
  }
});
