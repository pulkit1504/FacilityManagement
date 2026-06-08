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
  test("Claimant can reopen a returned claim and resume corrections", async ({ page }) => {
    await signInAs(page, "Claimant");
    let reopened = false;

    await page.route("**/api/v1/sites", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            siteId: "site-1",
            siteName: "Investor Demo Site",
            clientName: "Demo Client",
            serviceType: "SoftServices"
          }]
        })
      });
    });
    await page.route("**/api/v1/claims/advances", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await page.route("**/api/v1/claims/claim-returned-1", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(returnedClaimFixture(reopened ? "Draft" : "Rejected"))
      });
    });
    await page.route("**/api/v1/claims/claim-returned-1/reopen", async (route) => {
      expect(route.request().method()).toBe("POST");
      reopened = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          claimId: "claim-returned-1",
          status: "Draft",
          statusLabel: "Draft",
          message: "Claim reopened. Apply corrections and submit again."
        })
      });
    });

    await page.goto("/claims/claim-returned-1/edit");

    await expect(page.getByRole("heading", { level: 1, name: "Continue claim" })).toBeVisible();
    await expect(page.getByText("Returned for correction")).toBeVisible();
    await expect(page.getByText("Correct the invoice date.")).toBeVisible();

    await page.getByRole("button", { name: "Reopen for correction" }).click();

    await expect(page.getByText("Claim reopened. Apply corrections and submit again.")).toBeVisible();
    await expect(page.getByText("Returned for correction")).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Add Line Item" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Claim" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

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

function returnedClaimFixture(status: "Draft" | "Rejected") {
  return {
    claimId: "claim-returned-1",
    ticketId: "EXP-RETURNED",
    submitterEmployeeId: "emp-claimant-001",
    claimKind: "Reimbursement",
    submissionMode: "SingleVoucher",
    proformaPeriodStart: null,
    proformaPeriodEnd: null,
    claimPeriodMonth: "2026-06-01",
    advanceClaimId: null,
    advanceAmount: 0,
    settledAmount: 0,
    advanceBalance: 0,
    advanceAdjustmentAmount: 0,
    finalPayableAmount: 1250,
    netAdvanceLeftAmount: 0,
    status,
    statusLabel: status === "Draft" ? "Draft" : "Returned - see reason below",
    totalAmount: 1250,
    siteId: "site-1",
    rejectionReason: status === "Rejected" ? "Correct the invoice date." : null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    lineItems: [{
      lineItemId: "line-1",
      claimId: "claim-returned-1",
      expenseHead: "Client Rechargeable",
      description: "Already billed material",
      amount: 1250,
      transactionDate: "2026-06-03",
      paymentMode: "Cash",
      expenseTag: "AlreadyBilled",
      clientInvoiceNumber: "CLIENT-INV-1",
      vendorName: "Demo Vendor",
      vendorInvoiceNumber: "VENDOR-INV-1",
      billableAmount: null,
      siteOrDepartment: null,
      lineTicketId: null,
      invoiceValidationStatus: "PendingErpValidation",
      financeReviewStatus: "Pending",
      financeReviewRemarks: null,
      billingAlertCreated: false,
      siteId: null,
      missingReceiptFlag: false,
      sortOrder: 0,
      attachments: [{
        attachmentId: "attachment-1",
        lineItemId: "line-1",
        storagePath: "receipts/demo.pdf",
        contentHash: "abcdef1234567890",
        originalFileName: "receipt.pdf",
        fileSizeBytes: 1024,
        contentType: "application/pdf",
        uploadedAt: "2026-06-03T00:00:00.000Z",
        uploadedByUserId: "emp-claimant-001"
      }]
    }],
    approvalSteps: status === "Rejected" ? [{
      stepId: "step-1",
      claimId: "claim-returned-1",
      stepOrder: 1,
      requiredApproverRole: "HOD",
      assignedApproverId: "emp-hod-001",
      decision: "Rejected",
      decisionAt: "2026-06-04T00:00:00.000Z",
      remarks: "Correct the invoice date."
    }] : []
  };
}
