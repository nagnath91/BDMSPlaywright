/**
 * Central execution order for the BDMS regression run.
 *
 * `npm run test:ordered` runs these spec files strictly one after another, in
 * exactly this order, and stops at the first file that fails. Spec files that
 * are not listed here are NOT run by the ordered runner.
 *
 * To add a spec: add its path (relative to the project root, forward slashes
 * on every OS) at the position where it should run.
 */
const executionOrder = [
  'tests/My Profile/apply-leave.spec.ts',
  'tests/My Profile/approve-reject-leave.spec.ts',
  'tests/My Profile/apply-holiday-working.spec.ts',
  'tests/My Profile/approve-reject-holiday-working.spec.ts',
  'tests/My Profile/apply-travel.spec.ts',
  'tests/My Profile/approve-reject-travel.spec.ts',
  'tests/My Profile/request-to-buddy.spec.ts',
  'tests/My Profile/respond-to-buddy.spec.ts',
  'tests/My Profile/close-buddy-request.spec.ts',
  'tests/Workflow/add-worksheet.spec.ts',
  'tests/Workflow/process-worksheet.spec.ts',
  'tests/Workflow/review-worksheet.spec.ts',
  'tests/General Login and Logout/login-logout.spec.ts',
  'tests/General Login and Logout/timesheet-punchout.spec.ts',
];

module.exports = { executionOrder };
