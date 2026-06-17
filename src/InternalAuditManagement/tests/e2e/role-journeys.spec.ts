import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type TestRole = "Claimant" | "ClusterHead" | "Finance" | "Auditor" | "Admin";

const profiles: Record<TestRole, { userId: string; role: TestRole }> = {
  Claimant: { userId: "emp-claimant-001", role: "Claimant" },
  ClusterHead: { userId: "emp-cluster-001", role: "ClusterHead" },
  Finance: { userId: "emp-finance-001", role: "Finance" },
  Auditor: { userId: "emp-auditor-001", role: "Auditor" },
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
  test("Claimant can correct a returned claim without a second reopen decision", async ({ page }) => {
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
    await expect(page.getByText("Claim reopened. Apply corrections and submit again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen for correction" })).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Add Line Item" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Claim" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Claimant sees the active claim when returned correction is blocked by an advance duplicate", async ({ page }) => {
    await signInAs(page, "Claimant");

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
        body: JSON.stringify(returnedClaimFixture("Rejected"))
      });
    });
    await page.route("**/api/v1/claims/claim-returned-1/reopen", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 409,
        body: JSON.stringify({
          status: 409,
          title: "Conflict",
          detail: "This returned claim cannot be prepared for correction because EXP-ACTIVE-1 is already active for the same advance. Continue with that claim or ask Finance to close it before correcting this one.",
          activeClaimId: "claim-active-1",
          activeTicketId: "EXP-ACTIVE-1"
        })
      });
    });

    await page.goto("/claims/claim-returned-1/edit");

    await expect(page.getByText("Correction blocked")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open active claim EXP-ACTIVE-1" })).toHaveAttribute("href", "/claims/claim-active-1/edit");
    await expect(page.getByRole("button", { name: "Try preparing again" })).toBeHidden();
    await expect(page.getByText("Reopen first")).toBeHidden();
    await expect(page.getByText("Use active claim")).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Claimant can reach an accessible new-claim workflow", async ({ page }) => {
    await signInAs(page, "Claimant");
    await page.goto("/claims/new");

    await expect(page.getByRole("heading", { level: 1, name: "Create expense claim" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Nimbus Harbor and Striker Facility Management Services" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Claim" })).toHaveAttribute("aria-current", "page");
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Claimant can add multiple line items before submitting one claim", async ({ page }) => {
    await signInAs(page, "Claimant");
    const savedLines: Array<{ lineItemId: string; description: string; amount: number }> = [];
    let submittedLineCount = 0;

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
    await page.route("**/api/v1/claims", async (route) => {
      expect(route.request().method()).toBe("POST");
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ claimId: "claim-multi-line", status: "Draft" })
      });
    });
    await page.route("**/api/v1/claims/claim-multi-line/line-items", async (route) => {
      expect(route.request().method()).toBe("POST");
      const body = route.request().postDataJSON() as { description: string; amount: number };
      const lineItemId = `line-${savedLines.length + 1}`;
      savedLines.push({ lineItemId, description: body.description, amount: body.amount });
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ lineItemId, missingReceiptFlag: true, message: "Line item added." })
      });
    });
    await page.route("**/api/v1/claims/claim-multi-line/submit", async (route) => {
      expect(route.request().method()).toBe("POST");
      submittedLineCount = savedLines.length;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "Submitted",
          assignedTo: "Cluster Head",
          message: "Claim submitted with multiple line items."
        })
      });
    });
    await page.route("**/api/v1/claims/claim-multi-line/summary/export", async (route) => {
      await route.fulfill({
        body: "Ticket,Description,Amount\nEXP-MULTI,Replace lobby light,1250\nEXP-MULTI,Printer paper,750",
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="EXP-MULTI-summary.csv"' }
      });
    });

    await page.goto("/claims/new");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Add Line Item" })).toBeVisible();

    await page.getByLabel("Expense tag").selectOption("ContractPartCost");
    await expect(page.getByLabel("Line site")).toBeVisible();
    await expect(page.getByLabel("Site / department")).toHaveCount(0);
    await page.getByLabel("Line site").selectOption("site-1");
    await page.getByLabel("Expense tag").selectOption("PendingBilling");

    await page.getByLabel("Expense head").selectOption("Repairs and Maintenance");
    await page.getByLabel("Description").fill("Replace lobby light");
    await page.getByLabel("Amount", { exact: true }).fill("1250");
    await page.getByLabel("Billable amount").fill("1250");
    await page.getByRole("button", { name: "Save line item" }).click();

    await expect(page.getByRole("button", { name: "Add another line item" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Replace lobby light/ })).toBeVisible();
    await page.getByRole("button", { name: "Add another line item" }).click();
    await expect(page.getByRole("region", { name: "Line item editor" })).toBeFocused();

    await page.getByLabel("Expense head").selectOption("Printing and Stationery");
    await page.getByLabel("Description").fill("Printer paper");
    await page.getByLabel("Amount", { exact: true }).fill("750");
    await page.getByLabel("Billable amount").fill("750");
    await page.getByRole("button", { name: "Save line item" }).click();

    await expect(page.getByRole("row", { name: /Replace lobby light/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Printer paper/ })).toBeVisible();
    await page.getByRole("button", { name: "Submit claim" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Claim Submitted" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download claim summary" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download claim summary" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("EXP-MULTI-summary.csv");
    expect(savedLines).toHaveLength(2);
    expect(submittedLineCount).toBe(2);
  });

  test("Claimant can view embedded training and Imprest instructions", async ({ page }) => {
    await signInAs(page, "Claimant");
    await page.route("**/api/v1/sites", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await page.route("**/api/v1/claims/advances", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });

    await page.goto("/help");
    await expect(page.getByRole("heading", { level: 1, name: "How to use Facility Control" })).toBeVisible();
    await expect(page.locator("video source")).toHaveAttribute("src", "/application-tutorial.webm");
    await expect(page.getByRole("heading", { level: 2, name: "Quick start" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/imprest");
    await expect(page.getByRole("heading", { level: 2, name: "Imprest guidelines" })).toBeVisible();
    await expect(page.getByText("Keep the request within your configured employee Imprest limit.")).toBeVisible();
    await expect(page.getByText("Settle open balances promptly; only one active settlement may adjust an advance.")).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Approver can reach an accessible approval queue", async ({ page }) => {
    await signInAs(page, "ClusterHead");
    await page.route("**/api/v1/approvals/queue", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] })
      });
    });
    await page.route("**/api/v1/sites", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] })
      });
    });

    await page.goto("/approvals");

    await expect(page.getByRole("heading", { level: 1, name: "Operational approvals" })).toBeVisible();
    await expect(page.getByText("Loading approval queue...")).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Pending Approval Queue" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Finance can view and download a claim summary report", async ({ page }) => {
    await signInAs(page, "Finance");
    await page.route("**/api/v1/finance/queue", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            ...auditQueueFixture(),
            status: "FinanceConfirmed",
            physicalReceiptRequired: true,
            physicalReceiptConfirmed: true,
            advanceAdjustmentAmount: 0,
            netAdvanceLeftAmount: 0,
            bankAccountHolderName: "Riya Sharma",
            bankAccountNumber: "1234567890",
            bankIfsc: "HDFC0001234",
            bankName: "HDFC"
          }]
        })
      });
    });
    await page.route("**/api/v1/finance/advances", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await page.route("**/api/v1/claims/claim-audit-queue-1", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(auditClaimDetailFixture()) });
    });
    await page.route("**/api/v1/claims/claim-audit-queue-1/summary/export", async (route) => {
      await route.fulfill({
        body: "Ticket,Status\nEXP-AUD-QUEUE,Audit review pending",
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="EXP-AUD-QUEUE-summary.csv"' }
      });
    });

    await page.goto("/finance");

    await expect(page.getByLabel("Search records on this page")).toBeVisible();
    await page.getByLabel("Search records on this page").fill("EXP-AUD-QUEUE");
    await page.getByLabel("Search records on this page").press("Enter");
    await expect(page).toHaveURL(/q=EXP-AUD-QUEUE/);
    await expect(page.getByText("Search: exp-aud-queue")).toBeVisible();
    await expect(page.getByRole("row", { name: /EXP-AUD-QUEUE/ })).toBeVisible();
    await page.getByRole("button", { name: "View summary" }).click();
    const dialog = page.getByRole("dialog", { name: "EXP-AUD-QUEUE" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Claim summary report")).toBeVisible();
    await expect(dialog.getByText("Material purchase")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download summary CSV" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("EXP-AUD-QUEUE-summary.csv");
    await dialog.getByRole("button", { name: "Close claim summary" }).click();
    await expect(dialog).toBeHidden();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Finance can review vouchers, accept a line, and send the pack to Audit", async ({ page }) => {
    await signInAs(page, "Finance");
    let financeReviewStatus: "Pending" | "Accepted" = "Pending";
    let physicalReceiptConfirmed = false;

    await page.route("**/api/v1/finance/queue", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            ...auditQueueFixture(),
            status: "HodApproved",
            physicalReceiptRequired: true,
            physicalReceiptConfirmed,
            advanceAdjustmentAmount: 0,
            netAdvanceLeftAmount: 0,
            bankAccountHolderName: "Riya Sharma",
            bankAccountNumber: "1234567890",
            bankIfsc: "HDFC0001234",
            bankName: "HDFC"
          }]
        })
      });
    });
    await page.route("**/api/v1/finance/advances", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await page.route("**/api/v1/claims/claim-audit-queue-1", async (route) => {
      const detail = auditClaimDetailFixture();
      detail.status = "HodApproved";
      (detail as { physicalReceiptConfirmedAt: string | null }).physicalReceiptConfirmedAt = physicalReceiptConfirmed ? "2026-06-08T10:00:00.000Z" : null;
      detail.lineItems[0].financeReviewStatus = financeReviewStatus;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(detail) });
    });
    await page.route("**/api/v1/finance/claim-audit-queue-1/line-items/line-audit-queue-1/review", async (route) => {
      expect(route.request().method()).toBe("POST");
      financeReviewStatus = "Accepted";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          lineItemId: "line-audit-queue-1",
          financeReviewStatus: "Accepted",
          financeReviewRemarks: null,
          message: "Line item accepted."
        })
      });
    });
    await page.route("**/api/v1/finance/claim-audit-queue-1/confirm-physical-receipt", async (route) => {
      expect(route.request().method()).toBe("POST");
      physicalReceiptConfirmed = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          physicalReceiptConfirmedAt: "2026-06-08T10:00:00.000Z",
          message: "Physical receipt confirmed. Claim routed to Auditor for pre-payment review."
        })
      });
    });

    await page.goto("/finance");

    await expect(page.getByRole("button", { name: "Review vouchers" })).toBeEnabled();
    await page.getByRole("button", { name: "Review vouchers" }).click();
    await expect(page.getByText("Material purchase")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept all lines" })).toBeDisabled();

    await page.getByRole("button", { name: "Accept", exact: true }).click();
    const acceptedButton = page.getByRole("button", { name: "Accepted" });
    await expect(acceptedButton).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send to Audit" })).toBeEnabled();

    await page.getByRole("button", { name: "Send to Audit" }).click();
    await expect(page.getByText("Physical receipt confirmed. Claim routed to Auditor for pre-payment review.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sent to Audit" })).toBeDisabled();
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
    await expect(page.getByRole("heading", { level: 2, name: "Bulk Master Data Upload" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sample CSV" })).toHaveCount(4);
    await expect(page.getByText("Upload CSV", { exact: true })).toHaveCount(4);
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Auditor can see Audit Review must-have dashboard controls", async ({ page }) => {
    await signInAs(page, "Auditor");
    await page.route("**/api/v1/fraud/flags?status=Open", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          openFlagsCount: 1,
          flagsByRule: { DuplicateVoucher: 1 },
          flags: [auditFlagFixture()]
        })
      });
    });
    await page.route("**/api/v1/audit/queue", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          totalPending: 1,
          items: [auditQueueFixture()]
        })
      });
    });
    await page.route("**/api/v1/claims/claim-audit-queue-1", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(auditClaimDetailFixture())
      });
    });
    await page.route("**/api/v1/claims/claim-audit-queue-1/summary/export", async (route) => {
      await route.fulfill({
        body: "Ticket,Status\nEXP-AUD-QUEUE,Audit review pending",
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="EXP-AUD-QUEUE-summary.csv"' }
      });
    });
    await page.route("**/api/v1/audit/claims/claim-audit-queue-1/receive-vouchers", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          claimId: "claim-audit-queue-1",
          receivedAt: "2026-06-08T11:00:00.000Z",
          message: "Voucher pack marked as received."
        })
      });
    });

    await page.goto("/audit");

    await expect(page.getByRole("heading", { level: 1, name: "Audit dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Open Risk Summary" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Auditor Receipt Review Queue" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Risk Score Per Claim" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Aging Buckets" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Claim Status Tracker" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Reopen / Correction Tracking" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Filters" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Exception Queue" })).toBeVisible();
    await expect(page.locator("tbody").getByText("Duplicate voucher", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Employee")).toBeVisible();
    await expect(page.getByLabel("Department / Site")).toBeVisible();
    await expect(page.getByLabel("Claim type")).toBeVisible();
    await expect(page.getByLabel("Expense tag")).toBeVisible();
    await expect(page.getByLabel("Month")).toBeVisible();
    await expect(page.getByLabel("Approver")).toBeVisible();
    await expect(page.getByLabel("Vendor")).toBeVisible();
    await expect(page.getByLabel("Risk type")).toBeVisible();
    await expect(page.getByLabel("Status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request clarification" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark suspicious" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Escalate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Assign owner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "High-risk claims" })).toBeVisible();
    await page.getByRole("button", { name: "High-risk claims" }).click();
    await expect(page.locator("tbody").getByText("Duplicate voucher", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Pending information" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
    const auditQueue = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "Auditor Receipt Review Queue" }) });
    await auditQueue.getByRole("button", { name: "View summary" }).click();
    const summaryDialog = page.getByRole("dialog", { name: "EXP-AUD-QUEUE" });
    await expect(summaryDialog).toBeVisible();
    await expect(summaryDialog.getByText("Material purchase")).toBeVisible();
    await summaryDialog.getByRole("button", { name: "Close claim summary" }).click();
    await page.getByRole("button", { name: "Mark vouchers received" }).click();
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await page.getByRole("button", { name: "View receipts" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Receipt Evidence" })).toBeVisible();
    await expect(page.getByText("B2C - Already Billed | Demo Vendor | Client CLI-100 | Vendor VEND-100")).toBeVisible();
    await expect(page.getByRole("button", { name: "receipt.pdf" })).toBeVisible();

    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Drill-down Evidence" })).toBeVisible();
    await expect(page.getByText("2026-06-06 | B2C - Already Billed | Demo Vendor")).toBeVisible();
    await expect(page.getByText("Client CLI-100 | Vendor VEND-100", { exact: true })).toBeVisible();
    await expect(page.getByText("Approval trail")).toBeVisible();
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

function auditFlagFixture() {
  return {
    flagId: "flag-1",
    primaryClaimId: "claim-audit-1",
    relatedClaimIds: ["claim-audit-2"],
    ruleName: "DuplicateVoucher",
    ruleLabel: "Duplicate Voucher Suspected",
    ruleDescription: "Matching amount and transaction date found across claims.",
    relatedClaimCount: 1,
    daysOpen: 4,
    ticketId: "EXP-AUDIT-1",
    employeeName: "Riya Sharma",
    claimKind: "Reimbursement",
    submissionMode: "SingleVoucher",
    claimStatus: "Rejected",
    statusLabel: "Returned - see reason below",
    pendingLocation: "Claimant correction",
    siteName: "Investor Demo Site",
    totalAmount: 4800,
    flaggedLineItems: [{
      claimId: "claim-audit-1",
      lineItemId: "line-audit-1",
      description: "Material purchase",
      amount: 4800,
      transactionDate: "2026-06-06",
      expenseTag: "AlreadyBilled",
      clientInvoiceNumber: "CLI-100",
      vendorName: "Demo Vendor",
      vendorInvoiceNumber: "VEND-100",
      missingReceiptFlag: false,
      receiptAttachmentCount: 1
    }],
    approvalTrail: [{
      role: "HOD",
      decision: "Rejected",
      decidedAt: "2026-06-07T10:00:00.000Z",
      remarks: "Duplicate vendor invoice needs correction."
    }]
  };
}

function auditQueueFixture() {
  return {
    claimId: "claim-audit-queue-1",
    ticketId: "EXP-AUD-QUEUE",
    claimKind: "Reimbursement",
    submittedBy: "Riya Sharma",
    siteName: "Investor Demo Site",
    totalAmount: 4800,
    finalPayableAmount: 4800,
    lineItemCount: 1,
    missingReceiptCount: 0,
    daysPending: 1,
    urgencyLevel: "Normal",
    receiptConfirmedAt: "2026-06-08T10:00:00.000Z",
    auditorVoucherReceivedAt: null,
    pendingBillingItemCount: 1
  };
}

function auditClaimDetailFixture() {
  return {
    claimId: "claim-audit-queue-1",
    ticketId: "EXP-AUD-QUEUE",
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
    finalPayableAmount: 4800,
    netAdvanceLeftAmount: 0,
    status: "AuditPending",
    statusLabel: "Audit review pending",
    totalAmount: 4800,
    siteId: "site-1",
    rejectionReason: null,
    physicalReceiptConfirmedAt: "2026-06-08T10:00:00.000Z",
    physicalReceiptConfirmedBy: "emp-finance-001",
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-08T10:00:00.000Z",
    lineItems: [{
      lineItemId: "line-audit-queue-1",
      claimId: "claim-audit-queue-1",
      expenseHead: "Client Rechargeable",
      description: "Material purchase",
      amount: 4800,
      transactionDate: "2026-06-06",
      paymentMode: "UPI",
      expenseTag: "AlreadyBilled",
      clientInvoiceNumber: "CLI-100",
      vendorName: "Demo Vendor",
      vendorInvoiceNumber: "VEND-100",
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
        attachmentId: "attachment-audit-queue-1",
        lineItemId: "line-audit-queue-1",
        storagePath: "receipts/demo.pdf",
        contentHash: "abcdef1234567890",
        originalFileName: "receipt.pdf",
        fileSizeBytes: 1024,
        contentType: "application/pdf",
        uploadedAt: "2026-06-06T00:00:00.000Z",
        uploadedByUserId: "emp-claimant-001"
      }]
    }],
    approvalSteps: [{
      stepId: "step-audit-queue-1",
      claimId: "claim-audit-queue-1",
      stepOrder: 2,
      requiredApproverRole: "Auditor",
      assignedApproverId: null,
      decision: "Pending",
      decisionAt: null,
      remarks: null
    }]
  };
}
