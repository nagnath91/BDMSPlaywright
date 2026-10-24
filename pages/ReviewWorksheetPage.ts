import { Page, Locator, expect } from '@playwright/test';
import { WorksheetListPage, FilterColumn } from './WorksheetListPage';

/**
 * Workflow > Worksheet > Quick Action > "Review Or Knock Back Worksheet".
 * Same grid behaviour as the worksheet list, but with its own column layout and
 * no date-range pickers above the grid (the filters sit in the column row).
 */
export class ReviewWorksheetPage extends WorksheetListPage {
  protected columnIndex: Partial<Record<FilterColumn, number>> = {
    'Client Name': 2,
    'Master Activity': 3,
    'Task': 4,
    'Frequency': 5,
    'Period From': 6,
    'Period To': 7,
    'Notes': 9,
    'Status': 11,
    'Reviewer': 16,
  };
  protected dropdownColumns: FilterColumn[] = [
    'Client Name', 'Master Activity', 'Task', 'Frequency', 'Status', 'Reviewer',
  ];

  constructor(page: Page) {
    super(page);
  }

  /** Workflow -> Worksheet -> Quick Action -> Review Or Knock Back Worksheet, with the filter row shown. */
  async open(): Promise<void> {
    await this.workflowMenu.click();
    await this.worksheetMenu.click();
    await this.page.waitForURL(/\/workflow\/dashboard\/incomplete-worksheet/);
    await this.page.getByRole('button', { name: 'Quick Action' }).click();
    await this.page.getByRole('menuitem', { name: 'Review Or Knock Back Worksheet' }).click();
    await this.page.waitForURL(/\/workflow\/worksheet\/review-or-knock-back-worksheet/);
    await expect(this.rows.first()).toBeVisible();

    // The column filters are hidden until the filter button is pressed.
    await this.page.locator('button:has(.pi-filter)').first().click();
    await expect(this.filterCells.nth(2).locator('p-select').first()).toBeVisible();
  }

  /** Text of the Reviewer cell of ow (the grid's 17th column, index 16). */
  async reviewerOf(row: Locator): Promise<string> {
    return ((await row.locator('td').nth(16).innerText()) ?? '').trim();
  }

  /** Row's 3-dots menu -> Allocate Reviewer -> pick eviewer -> Assign. */
  async allocateReviewer(row: Locator, reviewer: string): Promise<void> {
    await row.locator('button:has(.pi-ellipsis-v)').click();
    await this.page.getByRole('menuitem', { name: 'Allocate Reviewer' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Allocate Reviewer' });
    await expect(dialog).toBeVisible();

    await dialog.locator('p-select').first().click();
    const search = this.page.locator('input.p-select-filter');
    if (await search.first().isVisible().catch(() => false)) await search.first().fill(reviewer);
    await this.page.getByRole('option', { name: reviewer, exact: true }).first().click();
    await dialog.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
  }
}
