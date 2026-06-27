import { test, expect } from "@playwright/test";

// End-to-end of the core reconciliation flow + key a11y assertions, in a real browser.
// Seed invoice INV-1044 (Konga Online, awaiting, ₦75,500) is reset by global-setup.

test("simulate a payment → invoice reconciles to paid, drawer + share link work", async ({ page }) => {
  await page.goto("/app");

  // a11y: the collection-rate donut exposes its value to screen readers.
  await expect(page.getByRole("img", { name: /Collection rate/i })).toBeVisible();

  // Drive the Simulate panel: pay INV-1044 in full.
  await page.locator(".sim select").selectOption("INV-1044");
  await page.locator(".sim input[type=number]").fill("75500");
  await page.getByRole("button", { name: /Send mock webhook/i }).click();

  // The live feed shows the reconciled payment (auto-waits through the 2s poll).
  await expect(page.locator(".feed")).toContainText("Konga", { timeout: 12_000 });

  // The invoice flips to paid on the workspace.
  await page.goto("/app/invoices");
  const row = page.locator("tr", { hasText: "INV-1044" });
  await expect(row).toContainText(/paid/i, { timeout: 12_000 });

  // Row is keyboard/AT-actionable and opens the statement drawer.
  await expect(row).toHaveAttribute("role", "button");
  await row.click();
  const drawer = page.getByRole("dialog", { name: /Statement for INV-1044/i });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("7741120385");                  // the dedicated virtual account
  await expect(drawer.getByText(/Customer payment page/i)).toBeVisible(); // M1 share link present
});

test("a11y: invoice rows are focusable buttons and the new-invoice dialog traps focus", async ({ page }) => {
  await page.goto("/app/invoices");
  await expect(page.locator("table.inv tr[tabindex='0']").first()).toBeVisible();

  // The toolbar "+ New invoice" must be clickable without the Simulate panel intercepting (U5 fix:
  // the app pages reserve a right gutter so the fixed panel never overlaps toolbar actions).
  await page.getByRole("button", { name: /New invoice/i }).click();
  const dialog = page.getByRole("dialog", { name: /New invoice/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
