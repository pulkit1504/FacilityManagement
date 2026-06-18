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
  test("Login page renders public logo assets", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: /Sign In|Tester Access/ })).toBeVisible();

    const logos = await page.locator(".company-logo-marks img").evaluateAll((images) =>
      images.map((image) => ({
        src: image.getAttribute("src"),
        naturalWidth: (image as HTMLImageElement).naturalWidth,
        naturalHeight: (image as HTMLImageElement).naturalHeight
      }))
    );

    expect(logos).toHaveLength(2);
    expect(logos.every((logo) => logo.naturalWidth > 0 && logo.naturalHeight > 0)).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

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
    await expect(page.getByRole("heading", { level: 1, name: "How to use Imprest Claim" })).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Run the app like a live investor walkthrough" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Claimant demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approver demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finance demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auditor demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Admin demo" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "End-to-end workflow" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Role-based demo paths" })).toBeVisible();
    await page.getByRole("button", { name: "Finance demo" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByText("Release payment only when Audit has approved and bank details are complete.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Finance workspace" })).toHaveAttribute("href", "/finance");
    await expect(page.getByRole("heading", { level: 2, name: "Demo script" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Evidence checklist" })).toBeVisible();
    await expect(page.getByText("Client invoice number for B2C - Already Billed")).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/imprest");
    await expect(page.getByRole("heading", { level: 2, name: "Imprest guidelines" })).toBeVisible();
    await expect(page.getByText("Keep the request within your configured employee Imprest limit.")).toBeVisible();
    await expect(page.getByText("Settle open balances promptly; only one active settlement may adjust an advance.")).toBeVisible();
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Smart Search closes when clicking outside the search surface", async ({ page }) => {
    await signInAs(page, "Claimant");
    await page.route("**/api/v1/claims", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await page.route("**/api/v1/search**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          groups: [
            { key: "claims", label: "Claims", items: [] },
            { key: "billing", label: "Billing Alerts", items: [] },
            { key: "audit", label: "Audit Flags", items: [] },
            { key: "employees", label: "Employees", items: [] }
          ]
        })
      });
    });

    await page.goto("/claims");
    await page.keyboard.press("/");
    await page.getByLabel("Search records on this page").fill("demo");
    const smartSearch = page.locator(".smart-search-popover");
    await expect(smartSearch.getByText("Claims", { exact: true })).toBeVisible();
    await page.getByRole("heading", { level: 1, name: "Claim history and status" }).click();
    await expect(smartSearch).toBeHidden();
  });

  test("Claimant can open a claim workspace with timeline and evidence exports", async ({ page }) => {
    await signInAs(page, "Claimant");
    const returned = returnedClaimFixture("Rejected");

    await page.route("**/api/v1/claims", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            claimId: returned.claimId,
            ticketId: returned.ticketId,
            claimKind: returned.claimKind,
            submissionMode: returned.submissionMode,
            status: returned.status,
            statusLabel: returned.statusLabel,
            totalAmount: returned.totalAmount,
            siteId: returned.siteId,
            siteName: "Investor Demo Site",
            createdAt: returned.createdAt,
            updatedAt: returned.updatedAt
          }]
        })
      });
    });
    await page.route("**/api/v1/claims/claim-returned-1/workspace", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(workspaceFixture(returned)) });
    });

    await page.goto("/claims");

    await page.getByRole("button", { name: "Open workspace" }).click();
    const drawer = page.getByRole("dialog", { name: "EXP-RETURNED" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("list", { name: "Claim status timeline" })).toBeVisible();
    await expect(drawer.getByText("Finance voucher review")).toBeVisible();
    await expect(drawer.getByText("Claim summary")).toBeVisible();
    await expect(drawer.getByText("Line items and receipt evidence")).toBeVisible();
    await expect(drawer.getByText("Comments and remarks")).toBeVisible();
    await expect(drawer.getByText("Receipt uploaded", { exact: true })).toBeVisible();
    await expect(drawer.getByText('Receipt uploaded for line item "Already billed material"')).toBeVisible();
    await expect(drawer.getByText("RECEIPT_UPLOADED")).toBeHidden();
    await expect(drawer.getByText("line-1")).toBeHidden();
    await expect(drawer.getByText("Duplicate hash: 0")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Export audit trail" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Download summary" })).toBeVisible();
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

  test("Finance sees a role control room with notifications and exports", async ({ page }) => {
    await signInAs(page, "Finance");
    await page.route("**/api/v1/dashboard/overview", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          metrics: {
            pendingApprovals: 0,
            financeQueueCount: 1,
            activeBillingAlerts: 0,
            openFraudFlags: 0,
            billingRecoveryPct: 100,
            canViewBillingMetrics: true,
            canViewFraudFlags: false
          }
        })
      });
    });
    await page.route("**/api/v1/finance/queue", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            ...auditQueueFixture(),
            status: "HodApproved",
            physicalReceiptRequired: true,
            physicalReceiptConfirmed: false,
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

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 2, name: "Finance control desk" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Today's Work" })).toBeVisible();
    await expect(page.getByText("Review vouchers")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Notification Center" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Export Center" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Imprest ledger CSV Open advances, settlements, and balances." })).toBeVisible();
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
    await page.route("**/api/v1/claims/claim-audit-queue-1/workspace", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(workspaceFixture({
          ...returnedClaimFixture("Draft"),
          claimId: "claim-audit-queue-1",
          ticketId: "EXP-AUD-QUEUE"
        }))
      });
    });
    await page.route("**/api/v1/search**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          groups: [
            {
              key: "claims",
              label: "Claims",
              items: [{
                id: "claim-audit-queue-1",
                title: "EXP-AUD-QUEUE",
                subtitle: "Riya Sharma | Investor Demo Site | Finance",
                href: "/finance",
                claimId: "claim-audit-queue-1"
              }]
            },
            { key: "billing", label: "Billing Alerts", items: [] },
            { key: "audit", label: "Audit Flags", items: [] },
            { key: "employees", label: "Employees", items: [] }
          ]
        })
      });
    });

    await page.goto("/finance");

    await expect(page.getByLabel("Search records on this page")).toBeVisible();
    await page.getByLabel("Search records on this page").fill("EXP-AUD-QUEUE");
    await page.getByRole("link", { name: /EXP-AUD-QUEUE/ }).click();
    await expect(page).toHaveURL(/q=EXP-AUD-QUEUE/);
    await expect(page).toHaveURL(/claim=claim-audit-queue-1/);
    await expect(page.getByText("Search: exp-aud-queue")).toBeVisible();
    await expect(page.getByRole("row", { name: /EXP-AUD-QUEUE/ })).toBeVisible();
    await page.getByRole("dialog", { name: "EXP-AUD-QUEUE" }).getByLabel("Close claim workspace").click();
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
    await page.route("**/api/v1/admin/master-data", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contracts: [{
            contractId: "contract-1",
            clientName: "Nimbus Client",
            description: "Facility contract",
            startDate: "2026-04-01",
            endDate: null,
            isActive: true
          }],
          sites: [
            {
              siteId: "site-active",
              siteName: "Nimbus Tower",
              siteAddress: "MG Road",
              serviceType: "Both",
              contractId: "contract-1",
              clientName: "Nimbus Client",
              contractDescription: "Facility contract",
              clusterHeadEmployeeId: "emp-cluster-001",
              clusterHeadName: "Cluster User",
              isActive: true
            },
            {
              siteId: "site-inactive",
              siteName: "Closed Site",
              siteAddress: "Old Road",
              serviceType: "Security",
              contractId: "contract-1",
              clientName: "Nimbus Client",
              contractDescription: "Facility contract",
              clusterHeadEmployeeId: "emp-cluster-001",
              clusterHeadName: "Cluster User",
              isActive: false
            }
          ],
          employees: [
            {
              employeeId: "emp-admin-001",
              fullName: "Admin User",
              email: "admin@example.com",
              role: "Admin",
              directManagerId: null,
              isHod: false,
              approvalThresholdAmount: 0,
              imprestAdvanceLimit: 0,
              bankAccountHolderName: null,
              bankAccountNumber: null,
              bankIfsc: null,
              bankName: null,
              passwordResetRequired: false,
              passwordUpdatedAt: "2026-06-01T00:00:00.000Z",
              isActive: true
            },
            {
              employeeId: "emp-cluster-001",
              fullName: "Cluster User",
              email: "cluster@example.com",
              role: "ClusterHead",
              directManagerId: null,
              isHod: false,
              approvalThresholdAmount: 10000,
              imprestAdvanceLimit: 25000,
              bankAccountHolderName: null,
              bankAccountNumber: null,
              bankIfsc: null,
              bankName: null,
              passwordResetRequired: true,
              passwordUpdatedAt: null,
              isActive: true
            }
          ],
          holidays: [{ holidayDate: "2026-08-15", holidayName: "Independence Day", isNational: true }],
          expenseHeads: [{
            expenseHeadId: "head-1",
            name: "Consumables",
            description: "Site consumables",
            isActive: true,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          }]
        })
      });
    });
    await page.route("**/api/v1/admin/notifications", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          totalCount: 0,
          deliveryHealth: {
            apiKeyConfigured: true,
            fromEmailConfigured: true,
            fromEmail: "onboarding@resend.dev",
            status: "Restricted",
            guidance: "The resend.dev sender is for testing and can only send to the Resend account email."
          }
        })
      });
    });
    await page.goto("/admin");

    await expect(page.getByRole("heading", { level: 1, name: "Operational setup" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Bulk Master Data Upload" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Add Expense Head" })).toBeVisible();
    await expect(page.getByRole("button", { name: /People/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sites/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mail Delivery/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Retention/ })).toBeVisible();

    await page.getByRole("button", { name: /People/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "User Login Access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset password" })).toBeVisible();
    const employeeForm = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: /Add Employee|Edit Employee/ }) });
    await expect(employeeForm.getByText("Employee ID *")).toBeVisible();
    await expect(employeeForm.getByText("Role *")).toBeVisible();
    await expect(employeeForm.getByText("Full name *")).toBeVisible();
    await expect(employeeForm.getByText("Email *")).toBeVisible();
    await expect(employeeForm.getByText("Account holder", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Sites/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Add Site" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Sites" })).toBeVisible();
    await expect(page.getByText("Closed Site")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark active" })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Edit Site" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save site" })).toBeVisible();

    await page.getByRole("button", { name: /Mail Delivery/ }).click();
    await expect(page.getByText("API key configured")).toBeVisible();
    await expect(page.getByText("onboarding@resend.dev")).toBeVisible();
    await expect(page.getByText(/resend\.dev sender is for testing/)).toBeVisible();

    await page.getByRole("button", { name: /Retention/ }).click();
    const cleanupButton = page.getByRole("button", { name: "Remove stale records" });
    await expect(cleanupButton).toBeDisabled();
    await page.getByLabel("I understand these stale records will be removed").check();
    await expect(cleanupButton).toBeEnabled();

    await page.getByRole("button", { name: /Setup/ }).click();
    await expect(page.getByRole("link", { name: "Sample CSV" })).toHaveCount(4);
    await expect(page.getByText("Upload CSV", { exact: true })).toHaveCount(4);
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Admin can bulk upload contracts with Excel-style headers and dates", async ({ page }) => {
    await signInAs(page, "Admin");
    const importedContracts: unknown[] = [];
    await page.route("**/api/v1/admin/master-data", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contracts: [],
          sites: [],
          employees: [],
          holidays: [],
          expenseHeads: []
        })
      });
    });
    await page.route("**/api/v1/admin/notifications", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          totalCount: 0,
          deliveryHealth: {
            apiKeyConfigured: true,
            fromEmailConfigured: true,
            fromEmail: "claims@send.nimbusharbor.in",
            status: "Ready",
            guidance: "Email provider credentials are configured."
          }
        })
      });
    });
    await page.route("**/api/v1/admin/contracts", async (route) => {
      expect(route.request().method()).toBe("POST");
      importedContracts.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ message: "Contract created." })
      });
    });

    await page.goto("/admin");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "contracts.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Client Name,Contract Description,Start Date,End Date\nNimbus Harbor,Annual FM contract,18-06-2026,31/03/2027")
    });

    await expect(page.getByText("Imported 1 contracts successfully.")).toBeVisible();
    expect(importedContracts).toEqual([{
      clientName: "Nimbus Harbor",
      description: "Annual FM contract",
      startDate: "2026-06-18",
      endDate: "2027-03-31"
    }]);
    await expectAccessiblePage(page);
    await expectNoHorizontalOverflow(page);
  });

  test("Admin sees a clear error for invalid contract CSV format", async ({ page }) => {
    await signInAs(page, "Admin");
    await page.route("**/api/v1/admin/master-data", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contracts: [],
          sites: [],
          employees: [],
          holidays: [],
          expenseHeads: []
        })
      });
    });
    await page.route("**/api/v1/admin/notifications", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          totalCount: 0,
          deliveryHealth: {
            apiKeyConfigured: true,
            fromEmailConfigured: true,
            fromEmail: "claims@send.nimbusharbor.in",
            status: "Ready",
            guidance: "Email provider credentials are configured."
          }
        })
      });
    });

    await page.goto("/admin");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "contracts-bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Client Name,Start Date\n,18-06-2026\nNimbus Harbor,31-02-2027")
    });

    await expect(page.getByText(/Imported 0 contracts\. 2 row\(s\) failed/)).toBeVisible();
    await expect(page.getByText(/Row 2: Missing required column value: clientName/)).toBeVisible();
    await expect(page.getByText(/Row 3: Invalid startDate/)).toBeVisible();
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

function workspaceFixture(claim: ReturnType<typeof returnedClaimFixture>) {
  return {
    claim: {
      ...claim,
      lineItems: claim.lineItems.map((line) => ({
        ...line,
        attachments: line.attachments.map((attachment) => ({
          ...attachment,
          uploadedByName: "Claimant User",
          duplicateContentHash: false
        }))
      }))
    },
    auditTrail: [
      {
        auditId: "audit-0",
        claimId: claim.claimId,
        actorUserId: "emp-claimant-001",
        actorName: "Claimant User",
        actionType: "RECEIPT_UPLOADED",
        preActionStatus: "Draft",
        postActionStatus: "Draft",
        auditRemarks: "Receipt uploaded for line item line-1",
        correlationId: "corr-0",
        actionTimestamp: "2026-06-03T00:00:00.000Z"
      },
      {
        auditId: "audit-1",
        claimId: claim.claimId,
        actorUserId: "emp-hod-001",
        actorName: "HOD User",
        actionType: "REJECT",
        preActionStatus: "Submitted",
        postActionStatus: "Rejected",
        auditRemarks: "Correct the invoice date.",
        correlationId: "corr-1",
        actionTimestamp: "2026-06-04T00:00:00.000Z"
      }
    ],
    comments: [{
      id: "approval:step-1",
      author: "HOD",
      body: "Correct the invoice date.",
      source: "Approval remark",
      timestamp: "2026-06-04T00:00:00.000Z"
    }],
    notifications: [],
    receiptQuality: {
      totalLines: claim.lineItems.length,
      linesMissingReceipts: 0,
      totalReceipts: 1,
      duplicateReceiptHashes: 0
    },
    availableActions: ["Correct returned claim", "Download summary", "Export audit trail", "Add comment"],
    userRole: "Claimant"
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
