import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type TestRole = "Claimant" | "ClusterHead" | "Finance" | "Admin";

const profiles: Record<TestRole, { userId: string; role: TestRole }> = {
  Claimant: { userId: "emp-claimant-001", role: "Claimant" },
  ClusterHead: { userId: "emp-cluster-001", role: "ClusterHead" },
  Finance: { userId: "emp-finance-001", role: "Finance" },
  Admin: { userId: "emp-admin-001", role: "Admin" }
};

async function signInAs(page: Page, role: TestRole) {
  const value = Buffer.from(JSON.stringify(profiles[role]), "utf8").toString("base64url");
  await page.context().addCookies([
    {
      name: "fm_test_user",
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}

async function expectAccessiblePage(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.describe("role journeys", () => {
  test("Claimant can reach an accessible new-claim workflow", async ({ page }) => {
    await signInAs(page, "Claimant");
    await page.goto("/claims/new");

    await expect(page.getByRole("heading", { level: 1, name: "Create expense claim" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Claim" })).toHaveAttribute("aria-current", "page");
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Approver can reach an accessible approval queue", async ({ page }) => {
    await signInAs(page, "ClusterHead");
    await page.goto("/approvals");

    await expect(page.getByRole("heading", { level: 1, name: "Operational approvals" })).toBeVisible();
    await expect(page.getByText("Loading approval queue...")).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Pending Approval Queue" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Finance correction dialog traps focus and announces validation errors", async ({ page }) => {
    await signInAs(page, "Finance");
    await page.goto("/finance");

    await expect(page.getByRole("heading", { level: 1, name: "Receipt gate and payment release" })).toBeVisible();
    await expect(page.getByText("Loading finance queue...")).toBeHidden();
    const returnButtons = page.getByRole("button", { name: "Return" });
    test.skip(await returnButtons.count() === 0, "Finance queue has no claim available for dialog testing.");

    const returnButton = returnButtons.first();
    await returnButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByLabel("Reason for correction")).toBeFocused();

    await dialog.getByRole("button", { name: "Return to claimant" }).click();
    await expect(dialog.getByRole("alert")).toContainText("at least 5 characters");

    await dialog.getByLabel("Reason for correction").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close decision dialog" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Return to claimant" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(returnButton).toBeFocused();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Admin retention controls are labelled and require acknowledgement", async ({ page }) => {
    await signInAs(page, "Admin");
    await page.goto("/admin");

    await expect(page.getByRole("heading", { level: 1, name: "Operational setup" })).toBeVisible();
    const cleanupButton = page.getByRole("button", { name: "Remove stale records" });
    await expect(cleanupButton).toBeDisabled();
    await page.getByLabel("I understand these stale records will be removed").check();
    await expect(cleanupButton).toBeEnabled();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });
});
