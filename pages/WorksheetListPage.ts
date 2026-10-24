import { Page, Locator, expect } from '@playwright/test';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** dd/mm/yyyy, the format the worksheet grid shows. */
export function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Column positions in the grid header / filter row. */
export type FilterColumn =
  | 'Client Name' | 'Master Activity' | 'Task' | 'Frequency'
  | 'Period From' | 'Period To' | 'Notes' | 'Status' | 'Reviewer';

const COLUMN_INDEX: Partial<Record<FilterColumn, number>> = {
  'Client Name': 3,
  'Master Activity': 4,
  'Task': 5,
  'Frequency': 6,
  'Period From': 7,
  'Period To': 8,
  'Notes': 10,
};

/** Workflow > Worksheet (Incomplete Worksheet list): filter, change status, allocate assignee. */
export class WorksheetListPage {
  readonly page: Page;

  /** Filter-row position of each column; subclasses for other worksheet grids override these. */
  protected columnIndex: Partial<Record<FilterColumn, number>> = COLUMN_INDEX;
  protected dropdownColumns: FilterColumn[] = ['Client Name', 'Master Activity', 'Task', 'Frequency'];

  readonly workflowMenu: Locator;
  readonly worksheetMenu: Locator;
  readonly calendar: Locator;
  readonly table: Locator;
  readonly filterCells: Locator;
  readonly rows: Locator;
  readonly confirmYesButton: Locator;
  readonly assignDialog: Locator;
  readonly assignButton: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.workflowMenu = page.getByRole('link', { name: 'Workflow' }).first();
    this.worksheetMenu = page.getByRole('link', { name: 'Worksheet', exact: true });
    this.calendar = page.getByRole('dialog', { name: 'Choose Date' });
    this.table = page.locator('p-table table');
    // Second header row holds the column filters (same column order as the first row).
    this.filterCells = this.table.locator('thead tr').nth(1).locator('th');
    this.rows = this.table.locator('tbody tr');
    this.confirmYesButton = page.getByRole('button', { name: 'Yes', exact: true });
    this.assignDialog = page.getByRole('dialog', { name: /Additional Assignee/i });
    this.assignButton = page.getByRole('button', { name: 'Assign', exact: true });
    this.successToast = page.locator('.p-toast-message-success');
    this.errorToast = page.locator('.p-toast-message-error');
  }

  /** Workflow (side menu) -> Worksheet. */
  async open(): Promise<void> {
    await this.workflowMenu.click();
    await this.worksheetMenu.click();
    await this.page.waitForURL(/\/workflow\/dashboard\/incomplete-worksheet/);
    await expect(this.rows.first()).toBeVisible();
  }

  /** Picks a date in one of the two date-range pickers above the grid (0 = from, 1 = to). */
  protected async pickDate(opener: Locator, date: Date): Promise<void> {
    await opener.click();
    await expect(this.calendar).toBeVisible();

    const targetIndex = date.getFullYear() * 12 + date.getMonth();
    for (let i = 0; i < 60; i++) {
      const month = (await this.calendar.getByRole('button', { name: 'Choose Month' }).innerText()).trim();
      const year = Number((await this.calendar.getByRole('button', { name: 'Choose Year' }).innerText()).trim());
      const shownIndex = year * 12 + MONTHS.indexOf(month);
      if (shownIndex === targetIndex) break;
      const step = shownIndex < targetIndex ? 1 : -1;
      await this.calendar.getByRole('button', { name: step === 1 ? 'Next Month' : 'Previous Month' }).click();
      const newIndex = shownIndex + step;
      await expect(this.calendar.getByRole('button', { name: 'Choose Month' })).toHaveText(MONTHS[((newIndex % 12) + 12) % 12]);
      await expect(this.calendar.getByRole('button', { name: 'Choose Year' })).toHaveText(String(Math.floor(newIndex / 12)));
    }

    await this.calendar
      .locator('td:not(.p-datepicker-other-month)')
      .getByText(String(date.getDate()), { exact: true })
      .click();
    // The grid reloads when a date is picked, which can leave the popup open a while.
    await this.calendar.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => this.page.keyboard.press('Escape'));
    await expect(this.calendar).toBeHidden();
  }

  /** Sets the Reminder / Due Date range above the grid. */
  async applyDateRange(from: Date, to: Date): Promise<void> {
    const opener = (n: number) => this.page.locator('p-datepicker').nth(n).getByRole('button', { name: 'Choose Date' });
    await this.pickDate(opener(0), from);
    await this.pickDate(opener(1), to);
    await expect(this.page.locator('p-datepicker').nth(0).locator('input')).toHaveValue(formatDate(from));
    await expect(this.page.locator('p-datepicker').nth(1).locator('input')).toHaveValue(formatDate(to));
  }

  /** Applies one column filter: dropdown columns are picked from the list, text columns are typed + Enter. */
  async filterColumn(column: FilterColumn, value: string | Date): Promise<void> {
    const date = value as Date;
    value = value instanceof Date ? formatDate(value) : value;
    const index = this.columnIndex[column];
    if (index === undefined) throw new Error('No ' + column + ' filter on this grid');
    const cell = this.filterCells.nth(index);
    const dropdown = cell.locator('p-select, p-multiselect').first();
    const isDropdown = this.dropdownColumns.includes(column);

    if (column === 'Period From' || column === 'Period To') {
      // These are date filters: typing does not apply them, so pick the day in the calendar popup.
      await this.pickDate(cell.locator('input').first(), date);
      await expect(cell.locator('input').first()).toHaveValue(formatDate(date));
    } else if (isDropdown) {
      // The option list (e.g. Master Activity) is sometimes slow to open or load, so retry the whole pick.
      const wanted = value;
      await expect(async () => {
        await this.page.keyboard.press('Escape');
        await dropdown.click({ timeout: 10000 });
        const search = this.page.locator('input.p-select-filter, input.p-multiselect-filter');
        if (await search.first().isVisible().catch(() => false)) await search.first().fill(wanted);
        await this.page.getByRole('option', { name: wanted, exact: true }).first().click({ timeout: 10000 });
      }).toPass({ timeout: 60000 });
      await this.page.keyboard.press('Escape');
    } else {
      await cell.locator('input').first().fill(value);
      await this.page.keyboard.press('Enter');
    }
    await this.waitForStableRows();
  }

  /** Waits until the grid stops reloading: the rows' text must be unchanged for ~1.5s. */
  async waitForStableRows(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    let last = '';
    let sameSince = Date.now();
    await expect(async () => {
      const now = (await this.rows.allInnerTexts()).join('||');
      if (now !== last) { last = now; sameSince = Date.now(); }
      expect(Date.now() - sameSince).toBeGreaterThan(1500);
    }).toPass({ timeout: 30000, intervals: [300] });
  }

  /** Asserts every listed row contains all of the given values (e.g. the Period From / Period To dates). */
  async expectRowsMatch(values: string[]): Promise<void> {
    // The grid may still show empty placeholder rows while it loads, so wait for real rows.
    await expect(this.rows.first()).toContainText(values[0], { timeout: 30000 });
    await this.waitForStableRows();
    expect(await this.rows.count(), 'Expected at least one filtered worksheet').toBeGreaterThan(0);
    for (const text of await this.rows.allInnerTexts()) {
      for (const v of values) expect(text, 'Row does not match the applied filters').toContain(v);
    }
  }

  /**
   * First listed worksheet that is still "Not started", pinned by its position
   * so it keeps pointing at the same row after its status changes.
   */
  async notStartedRow(): Promise<Locator> {
    await expect(this.rows.filter({ hasText: 'Not started' }).first(), 'Expected a filtered worksheet that is still Not started').toBeVisible();
    const texts = await this.rows.allInnerTexts();
    return this.rows.nth(texts.findIndex((t) => t.includes('Not started')));
  }

  /** First listed worksheet with the given status, pinned by position. */
  async rowWithStatus(status: string): Promise<Locator> {
    await expect(
      this.rows.filter({ hasText: status }).first(),
      `Expected a filtered worksheet with status "${status}"`
    ).toBeVisible();
    const texts = await this.rows.allInnerTexts();
    return this.rows.nth(texts.findIndex((t) => t.includes(status)));
  }

  /** Clicks the checklist button (before the 3 dots) of `row`; it opens in a new tab, which is returned. */
  async openChecklist(row: Locator): Promise<Page> {
    const [checklistTab] = await Promise.all([
      this.page.context().waitForEvent('page'),
      row.locator('button:has(.fa-list-check)').click(),
    ]);
    await checklistTab.waitForLoadState('domcontentloaded');
    return checklistTab;
  }

  /** Changes the status of `row` to "Work in progress" and confirms with Yes. */
  async startWork(row: Locator): Promise<void> {
    await this.waitForStableRows();
    // The grid can re-render right after filtering and detach the open dropdown, so retry the pick.
    await expect(async () => {
      await row.locator('p-select').filter({ hasText: 'Not started' }).click();
      await this.page.getByRole('option', { name: 'Work in progress', exact: true }).click({ timeout: 5000 });
    }).toPass({ timeout: 30000 });
    await this.confirmYesButton.click();
    await expect(row.locator('p-select').filter({ hasText: 'Work in progress' })).toBeVisible();
  }

  /** Row's 3-dots menu -> Allocate Additional Assignee -> pick the user -> Assign. */
  async allocateAdditionalAssignee(row: Locator, assignee: string): Promise<void> {
    // Let the status toast go away so the success message we read afterwards is the assign one.
    await expect(this.successToast).toHaveCount(0, { timeout: 15000 });
    await row.locator('button.p-button-action').last().click();
    await this.page.getByRole('menuitem', { name: /Allocate Additional Assignee/i }).click();
    await expect(this.assignDialog).toBeVisible();

    await this.assignDialog.locator('p-select, p-multiselect').first().click();
    const search = this.page.locator('input.p-select-filter, input.p-multiselect-filter');
    if (await search.first().isVisible().catch(() => false)) await search.first().fill(assignee);
    await this.page.getByRole('option', { name: assignee, exact: true }).first().click();
    await this.page.keyboard.press('Escape');

    await this.assignButton.click();
  }

  /** Asserts a success toast appears (and no error); returns its text. */
  async expectSuccess(timeout = 15000): Promise<string> {
    try {
      await expect(this.successToast.first()).toBeVisible({ timeout });
    } catch {
      const message = (await this.errorToast.first().innerText().catch(() => '')).trim();
      throw new Error(`Action failed${message ? `: ${message}` : ' (no success message shown)'}`);
    }
    return (await this.successToast.first().innerText()).trim();
  }
}






