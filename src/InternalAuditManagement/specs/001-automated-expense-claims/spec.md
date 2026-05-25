# Feature Specification: Automated Expense Claims Mechanism

**Feature Branch**: `001-automated-expense-claims`
**Created**: 2026-05-25
**Status**: Draft
**Domain**: Internal Audit Management — Facility Management (Housekeeping & Security, Residential Societies)

---

## Context & Business Problem

Facility Management companies operating housekeeping and security services across multiple residential society sites face three systemic financial control failures:

1. **Revenue Leakage** — Client-billable expenses are incurred at sites but never billed, creating direct margin erosion.
2. **Procurement Fraud** — Duplicate, inflated, or split claims go undetected due to manual paper-based processes.
3. **Regulatory Non-Compliance** — Physical voucher trails are untracked, and tax-compliance audits cannot be satisfied.

This feature delivers a closed-loop, fully auditable expense claims system that bridges field operational realities (mobile-first, low-connectivity, distributed sites) with strict financial controls.

---

## User Scenarios & Testing

### User Story 1 — Claimant Submits a Site Expense Claim (Priority: P1)

A housekeeping supervisor or security site manager incurs a site expense (e.g., cleaning supplies, travel to site, emergency maintenance material) and submits a reimbursement claim with a full line-item breakdown and optional digital receipt.

**Why this priority**: This is the core data-entry point for the entire system. No downstream workflow, approval, billing, or fraud detection can function without a submitted claim.

**Independent Test**: A claimant can log in, create a new expense claim with at least two line items, assign an expense tag to each line item, optionally upload a receipt image per line item, and submit the claim for approval — without any other system component being active.

**Acceptance Scenarios**:

1. **Given** a logged-in claimant, **When** they select "Single Voucher Entry" and add one or more line items with descriptions, amounts, dates, and expense tags, **Then** the claim is saved in "Submitted" status and routed to the approval queue.
2. **Given** a claimant submitting a Periodic Proforma, **When** they attempt to enter a single bulk total without line-item breakdown, **Then** the system blocks submission with an error: "Itemized line-by-line breakdown is mandatory for Proforma submissions."
3. **Given** a claimant who uploads a receipt image per line item, **When** the claim is submitted, **Then** each attachment is stored securely and linked to its line item with an integrity hash.
4. **Given** a claimant who submits without any receipt attachment, **When** the claim is submitted, **Then** it is accepted AND automatically flagged "Missing Receipt" in the ledger — visible to Finance and the HOD.
5. **Given** a claimant, **When** they try to view another employee's claim, **Then** the system returns a permission denial.

---

### User Story 2 — Expense Line Item Tagged for Billing or Cost Centre (Priority: P2)

Every expense line item must be classified through a strict four-way tagging matrix to ensure correct cost allocation and client billing.

**Why this priority**: The tagging decision drives three downstream processes simultaneously — approval routing weight, billing alert triggers, and MIS dashboard accuracy. Incorrect tagging means revenue loss or cost misallocation.

**Independent Test**: A claimant can classify each line item as one of four tags (Already Billed, Pending Billing, Contract Part Cost, Backend CTC), and the system enforces the correct follow-up action per tag — independently verifiable with a single multi-line claim.

**Acceptance Scenarios**:

1. **Given** a line item tagged "Already Billed", **When** the claimant does not enter a Client Invoice Number, **Then** the system blocks saving that line item with: "A valid Client Invoice Number is required for Already Billed items."
2. **Given** a line item tagged "Already Billed" with an invoice number entered, **When** the claim is saved, **Then** the system validates the invoice number against the ERP billing database and rejects unrecognised numbers.
3. **Given** a line item tagged "Pending Billing", **When** the claim is approved by Finance, **Then** the system automatically creates a billing alert record and initiates the 48-hour reminder loop to the Billing Team.
4. **Given** a line item tagged "Contract Part Cost", **When** the claim is approved, **Then** the amount is posted against the specific site's gross margin dashboard — not billed to the client.
5. **Given** a line item tagged "Backend CTC", **When** the claim is approved, **Then** the amount is posted as indirect corporate overhead — not billed to any client or site.

---

### User Story 3 — Dynamic Approval Routing Based on Org Hierarchy (Priority: P3)

Claims are routed automatically based on the claimant's position in the corporate org-chart, enforcing segregation of duties without manual intervention.

**Why this priority**: Manual routing creates bottlenecks and bypasses. Automated routing from the org-chart is required for audit defensibility.

**Independent Test**: Two separate claims — one from a standard employee and one from an HOD — can be submitted and correctly routed to different approvers automatically, verifiable by checking the approval queue for each approver.

**Acceptance Scenarios**:

1. **Given** a standard claimant submits a claim, **When** the claim is submitted, **Then** it is routed to their direct Operational HOD's approval queue.
2. **Given** an HOD submits a claim, **When** the claim is submitted, **Then** it is routed directly to the Managing Director's approval queue — bypassing all other HODs.
3. **Given** an approver (HOD or MD) approves a claim, **When** the approval is recorded, **Then** the claim is automatically forwarded to the Finance Department queue.
4. **Given** an approver rejects a claim, **When** the rejection is submitted, **Then** the system requires a mandatory rejection reason, notifies the claimant, and the claim returns to "Rejected" status with full audit trail.
5. **Given** a claim in the Finance queue, **When** a Finance user reviews it, **Then** they can confirm, modify the billable tag (with mandatory remarks), and proceed to payment — or reject it back to the claimant.

---

### User Story 4 — Finance Physical Receipt Confirmation & Payment Gate (Priority: P4)

Finance must confirm physical receipt of original vouchers before the system releases any payment, creating a hard gate between digital approval and actual disbursement.

**Why this priority**: This is the primary anti-fraud control. Without it, a claimant can receive payment without the company ever obtaining the original tax-compliant invoice — exposing the company to GST/tax non-compliance.

**Independent Test**: An approved claim cannot transition to "Payment Released" status unless a Finance user has explicitly entered the physical receipt confirmation date and time — verifiable by attempting payment release without this confirmation.

**Acceptance Scenarios**:

1. **Given** a claim that has been operationally approved and is in the Finance queue, **When** a Finance user attempts to release payment without entering the physical receipt date/time, **Then** the system blocks the action with: "Physical receipt confirmation is required before payment can be released."
2. **Given** a Finance user enters the physical receipt date and time, **When** they confirm, **Then** the system records the confirmation in the audit log and unlocks the payment release action.
3. **Given** a Finance user modifies a billable tag on a claim, **When** they save the change, **Then** the system mandates an "Audit Remarks" field entry and writes both pre-change and post-change values to the immutable log.

---

### User Story 5 — Automated Billing Alert Loop for Pending Items (Priority: P5)

All expenses tagged "Pending Billing" must be tracked through an automated, escalating reminder system until a corresponding client invoice number is entered.

**Why this priority**: This is the primary revenue leakage control. Without automated follow-through, "Pending Billing" items silently age and are never invoiced.

**Independent Test**: A "Pending Billing" line item that has been Finance-approved triggers email alerts to the Billing Team within 48 hours, escalates to Finance HOD on day 7, and the loop stops only when an invoice number is entered — each step independently observable in the alert log.

**Acceptance Scenarios**:

1. **Given** a Finance-approved "Pending Billing" line item, **When** 48 hours elapse without an invoice number being entered, **Then** the system sends an automated email reminder to the Billing Team with claim details.
2. **Given** a "Pending Billing" item with no invoice entered for 7 days, **When** the daily alert job runs, **Then** an escalation alert is sent to the Finance HOD.
3. **Given** an active alert loop, **When** a Billing Team member enters a valid Client Invoice Number and links it to the pending item, **Then** all active alerts for that item are cancelled and the item status updates to "Billed."
4. **Given** a valid invoice number is entered, **When** the system validates it against the ERP billing database, **Then** only matching, unlinked invoice numbers are accepted.

---

### User Story 6 — Nightly Fraud Detection Sweeps (Priority: P6)

Three automated fraud detection rules run nightly and surface flagged transactions for Finance and Internal Audit review every morning.

**Why this priority**: Manual fraud review across distributed sites is impractical. Automated sweeps provide consistent, rule-based surveillance without adding operational overhead.

**Independent Test**: Inserting three synthetic test claims (duplicate amounts same date, split claims below threshold, weekend-dated backend claim) triggers three corresponding fraud flags that appear in the Finance fraud review dashboard the following morning.

**Acceptance Scenarios**:

1. **Given** two claims submitted by different employees on the same date with identical amounts, **When** the nightly sweep runs, **Then** both claims are flagged "Duplicate Voucher Suspected" in the fraud review queue.
2. **Given** a single employee submits three claims within a 48-hour window, each amount being just below the HOD approval threshold, **When** the nightly sweep runs, **Then** all three claims are flagged "Threshold Split Suspected."
3. **Given** a claim categorised as "Backend CTC" with a transaction date falling on a weekend or public holiday, **When** the nightly sweep runs, **Then** the claim is flagged "Non-Operational Day — Verify Business Intent."
4. **Given** flagged claims appear in the fraud review queue, **When** a Finance/Audit user reviews each flag, **Then** they can mark it "Cleared — Legitimate" or "Confirmed Fraud — Escalate" with mandatory remarks, and the decision is written to the audit log.

---

### User Story 7 — Management MIS Dashboard (Priority: P7)

Finance HOD and senior management access a real-time dashboard showing billing recovery performance, individual employee claim behaviour, and active fraud alerts.

**Why this priority**: Operational visibility is the feedback loop that makes all other controls meaningful. Without it, the system generates data but no decision-making value.

**Independent Test**: A Finance HOD can view the Billing Recovery Ratio for at least one active client contract, see the 30/60/90-day claim trend for at least one employee, and review the current fraud flag queue — without any claim needing to complete the full workflow.

**Acceptance Scenarios**:

1. **Given** approved billable expenses exist, **When** a Finance HOD opens the dashboard, **Then** they see the Billing Recovery Ratio per client contract: (Total Billed ÷ Total Billable Approved Expenses) × 100.
2. **Given** a contract's Billing Recovery Ratio falls below 100%, **When** the dashboard renders, **Then** that contract is highlighted as a revenue leakage risk.
3. **Given** an employee's 30-day claim total deviates by more than +2 standard deviations from their peer group baseline, **When** the dashboard renders, **Then** that employee is flagged as a behavioural outlier.
4. **Given** active fraud flags exist, **When** a Finance HOD views the fraud panel, **Then** all unresolved flags are visible with claim details, rule triggered, and days-open count.

---

### Edge Cases

- What happens when an HOD is also the sole Finance approver (small company scenario)? — System must enforce segregation; a dual-role user cannot approve their own claims in either capacity.
- What happens when the ERP billing database is unreachable at submission time? — System must accept the invoice number with a "Pending ERP Validation" flag and re-validate asynchronously; it must not block the entire claim.
- What happens when a submitted proforma spans a calendar month boundary (e.g., 20 Apr – 5 May)? — The system must accept the date range but require all line item dates to fall within the declared window.
- What happens when a receipt upload fails mid-submission? — Partially uploaded receipts must not be linked to the line item; the field reverts to "Missing Receipt" state and alerts the user.
- What happens if the nightly fraud sweep is missed due to system downtime? — A catch-up sweep must run on next system restart covering the missed window.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST support two submission modes: Single Voucher Entry (ad-hoc) and Periodic Proforma Summary (15–30 day accumulation window).
- **FR-002**: System MUST enforce line-item breakdown for all submissions; Periodic Proforma MUST programmatically reject bulk-sum entries that lack itemised line breakdown.
- **FR-003**: System MUST provide per-line-item document upload (image/PDF); submissions without attachments MUST be automatically flagged "Missing Receipt" in the claim ledger.
- **FR-004**: Every expense line item MUST be classified through the four-way tagging matrix: Billable→Already Billed, Billable→Pending Billing, Non-Billable→Contract Part Cost, Non-Billable→Backend CTC.
- **FR-005**: "Already Billed" line items MUST require entry of a Client Invoice Number; the system MUST validate this number against the ERP billing database before accepting the line item.
- **FR-006**: "Pending Billing" items, once Finance-approved, MUST trigger an automated 48-hour reminder email loop to the Billing Team, escalating to Finance HOD at day 7, repeating until a valid invoice number is linked.
- **FR-007**: Approval routing MUST be determined dynamically from the corporate org-chart: Standard Claimant → Operational HOD; HOD → Managing Director; all claims then route to Finance for final reconciliation.
- **FR-008**: Rejection at any approval stage MUST require a mandatory rejection reason; the claimant MUST be notified and the claim returned to "Rejected" status.
- **FR-009**: Payment release MUST be blocked until a Finance user explicitly records the physical receipt confirmation date and time in the system.
- **FR-010**: Finance users have sole authority to modify expense billable tags; any modification MUST trigger a mandatory remarks field and write a full before/after audit log entry.
- **FR-011**: Every system action MUST write an immutable, append-only audit log entry with fields: Log_ID, Claim_ID, Action_Timestamp (UTC), Actor_User_ID, Action_Type (SUBMIT / HOD_APPROVE / MD_APPROVE / FINANCE_CONFIRM / REJECT / PAYMENT_RELEASE / FRAUD_FLAG / FRAUD_CLEAR), Pre_Action_Status, Post_Action_Status, Audit_Remarks (mandatory for REJECT and billable-tag changes).
- **FR-012**: Nightly fraud detection MUST run three automated rules: (a) Duplicate Voucher — identical amounts on same date across employees; (b) Threshold Split — multiple claims from one employee within 48 hours each below the HOD approval threshold; (c) Weekend/Holiday Outlier — Backend CTC claims dated on non-operational days.
- **FR-013**: Management MIS dashboard MUST display: Billing Recovery Ratio per client contract, Employee Multi-Period Quantum Report (30/60/90-day rolling windows), and active unresolved fraud flag queue.
- **FR-014**: RBAC enforcement: Claimants MUST NOT access other employees' claims; HODs MUST access only direct subordinates' records; Finance MUST have global read visibility; no role can modify the audit log.
- **FR-015**: All uploaded digital receipts MUST be encrypted at rest (AES-256) and each file MUST be mapped to its line item via a cryptographic hash signature to detect tampering or substitution.
- **FR-016**: All core data operations MUST be exposed via versioned RESTful API endpoints to support integration with the ERP billing module and HR org-chart data source.

### Security & Compliance Requirements *(mandatory — per Constitution v1.1.0)*

- **SEC-001**: Every endpoint (except health checks) MUST require a valid Bearer token; unauthenticated requests MUST return `401 Unauthorized`.
- **SEC-002**: Every endpoint MUST enforce role-based access; a user operating outside their permitted role MUST receive `403 Forbidden` and the attempt MUST be logged as a security event.
- **SEC-003**: All claim create/update/status-change operations MUST produce immutable audit log entries — this is both a constitution requirement and a regulatory compliance requirement for this domain.
- **SEC-004**: All inputs (claim amounts, dates, invoice numbers, attachment metadata) MUST be validated and sanitised at the API boundary; invalid input MUST return an RFC 7807 Problem Details error response.
- **SEC-005**: No employee personal data, claim amounts, or invoice details MUST appear in application logs; logs MUST reference entity IDs only.

### Key Entities

- **ExpenseClaim**: Top-level claim record. Attributes: ClaimID, SubmitterEmployeeID, SubmissionMode (SingleVoucher/Proforma), ProformaPeriodStart, ProformaPeriodEnd, Status (Draft/Submitted/HOD_Approved/MD_Approved/Finance_Confirmed/Payment_Released/Rejected), CreatedAt (UTC), UpdatedAt (UTC), RowVersion.
- **ExpenseLineItem**: Individual line within a claim. Attributes: LineItemID, ClaimID, Description, Amount (currency), TransactionDate, ExpenseTag (AlreadyBilled/PendingBilling/ContractPartCost/BackendCTC), ClientInvoiceNumber (nullable), BillingStatus, SiteID (for Contract Part margin allocation), MissingReceiptFlag.
- **ExpenseAttachment**: Digital receipt linked to a line item. Attributes: AttachmentID, LineItemID, StorageReference (blob path), ContentHash (SHA-256), UploadedAt, UploadedByUserID, FileType (image/pdf).
- **AuditLog**: Immutable event record. Attributes: LogID, ClaimID, ActionTimestamp (UTC, system-generated), ActorUserID, ActionType (Enum), PreActionStatus, PostActionStatus, AuditRemarks. No update or delete operations permitted.
- **ApprovalStep**: Tracks each stage of approval. Attributes: StepID, ClaimID, ApproverEmployeeID, ApproverRole, Decision (Approved/Rejected), DecisionTimestamp, Remarks.
- **BillingAlert**: Tracks the pending billing reminder loop. Attributes: AlertID, LineItemID, CreatedAt, LastSentAt, EscalationLevel (BillingTeam/FinanceHOD), ResolvedAt (nullable), ResolvedByUserID.
- **FraudFlag**: Result of a nightly fraud sweep. Attributes: FlagID, ClaimID (or array of ClaimIDs for cross-claim rules), RuleName (DuplicateVoucher/ThresholdSplit/WeekendOutlier), FlaggedAt, Status (Open/Cleared/Escalated), ReviewedByUserID, ReviewRemarks, ReviewedAt.
- **Employee**: Org-chart participant. Attributes: EmployeeID, Name, Department, Role, DirectManagerID, HODFlag, ApprovalThresholdAmount.
- **ClientContract**: For billing validation and margin tracking. Attributes: ContractID, ClientName, SiteIDs[], BilledAmount, TotalApprovedBillableAmount (computed).

---

## Technology Resources & Rationale

> This section specifies the approved technology stack. All choices are justified on a **low-cost / zero-cost first** principle suitable for a small-to-medium Facility Management company operating residential society sites.

### Hosting & Deployment

| Layer | Resource | Plan | Monthly Cost | Rationale |
|-------|----------|------|--------------|-----------|
| Frontend Web App | **Vercel** | Hobby (Free) | ₹0 | Zero-config CI/CD from GitHub, global CDN, automatic HTTPS, Next.js-native. Ideal for web + mobile-responsive claimant and finance interfaces. |
| Backend API | **Azure Functions** (Consumption Plan) | Free Tier | ₹0 | 1 million free executions/month. Serverless — zero cost at idle, scales on demand. Perfect for a company with burst claim activity rather than constant load. Timer-triggered functions handle nightly fraud sweeps at no extra cost. |
| Background Jobs | **Azure Functions** (Timer Trigger) | Included above | ₹0 | Nightly fraud sweeps and billing alert loops run as timer-triggered functions within the same free tier consumption plan. |

### Data Storage

| Layer | Resource | Plan | Monthly Cost | Rationale |
|-------|----------|------|--------------|-----------|
| Relational Database | **Azure SQL Database** (Serverless) | Free Offer (32 GB, 100k vCore-sec/month) | ₹0–₹400 | Supports all relational data (claims, line items, approvals, audit log). Serverless auto-pauses when idle — critical for cost control. The free offer covers a small FM company's volume for the first year; beyond that, the lowest serverless tier is ~₹300–400/month. |
| Document / Receipt Storage | **Azure Blob Storage** (LRS) | Pay-as-you-go | ~₹50–150/mo | AES-256 encryption at rest built-in. ETags provide native hash verification for tamper detection. 5 GB free for first 12 months; thereafter ~₹1.5/GB/month. A company with 500 receipts/month at avg 500 KB ≈ 3 GB/year. |

### Identity & Security

| Layer | Resource | Plan | Monthly Cost | Rationale |
|-------|----------|------|--------------|-----------|
| Authentication & RBAC | **Azure Entra ID** (formerly Azure AD) | Free Tier | ₹0 | 50,000 MAU free. Provides Bearer token issuance, RBAC claim groups, MFA, and conditional access — all constitution requirements met at zero cost. |
| Secrets Management | **Azure Key Vault** | Free / Standard | ₹0–₹30 | First 10,000 secret operations/month free. Stores all connection strings, API keys, and encryption keys — no hardcoded credentials in source. |

### Observability & Monitoring

| Layer | Resource | Plan | Monthly Cost | Rationale |
|-------|----------|------|--------------|-----------|
| Logging, Tracing & Metrics | **Azure Application Insights** | Free Tier | ₹0 | 5 GB data/month free. Provides structured log ingestion, distributed tracing (W3C), request metrics, and alerting — fulfils all Constitution Principle V requirements at no cost. |

### Communication (Billing Alerts)

| Layer | Resource | Plan | Monthly Cost | Rationale |
|-------|----------|------|--------------|-----------|
| Email Notifications | **Azure Communication Services** (Email) | Free Tier | ₹0 | 100 emails/day free. Sufficient for billing alert loops and approval notifications in a company with under 50–100 active claims/day. |

### API Integration

| Layer | Resource | Plan | Monthly Cost | Rationale |
|-------|----------|------|--------------|-----------|
| ERP / HR Integration Gateway | **Azure API Management** (Consumption Tier) | 1M calls/month free | ₹0 | Provides secure, versioned API gateway for ERP and HR org-chart integrations. Consumption tier is per-call billed with a 1M free call monthly allowance — more than sufficient. |

### Estimated Total Monthly Cost (Production, After Free Trial)

| Scenario | Estimated Cost |
|----------|----------------|
| First 12 months (free-tier active) | **₹0/month** |
| After free tier (low usage, <50 claims/day) | **₹400–600/month** |
| Growth phase (50–200 claims/day) | **₹1,000–2,500/month** |

> All cost estimates are in Indian Rupees (INR). Azure free tiers reset monthly. Vercel Hobby remains free indefinitely for non-commercial or small-team use; upgrade to Vercel Pro (₹1,700/month) only when team collaboration features are needed.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: A field claimant can complete a full multi-line expense submission with receipt upload in under 4 minutes on a mobile browser.
- **SC-002**: Zero "Pending Billing" items older than 48 hours exist without an active alert in the Billing Team's queue.
- **SC-003**: The Billing Recovery Ratio dashboard reflects all Finance-confirmed claims within 60 seconds of confirmation.
- **SC-004**: Nightly fraud sweep results are available in the Finance fraud review queue by 07:00 AM every business morning.
- **SC-005**: 100% of expense claims from submission to payment carry a complete, unbroken, tamper-evident audit trail — verifiable by exporting the log for any claim.
- **SC-006**: No claim can transition to "Payment Released" status unless a physical receipt confirmation timestamp exists in the system — enforced at the data layer, not only in the UI.
- **SC-007**: The system operates within the free-tier cost envelope (₹0/month) for the first 12 months assuming under 50 claims/day.
- **SC-008**: Finance HOD can identify the top 3 revenue-leakage contracts and the top behavioural outlier employee from the MIS dashboard in under 2 minutes without assistance.

---

## Assumptions

1. An HR system exists that exposes employee org-chart data (manager–subordinate relationships, HOD flags, approval thresholds) via a queryable API or exportable dataset. If not, the org-chart will be configured manually in the system at launch.
2. An ERP billing system exists and exposes a lookup endpoint to validate Client Invoice Numbers. If not, Finance will manually mark invoice validation until the ERP integration is live (the system will support a "Manual Override" flag for this transition period).
3. The company's corporate holiday calendar is provided by HR at setup and is configurable annually — required for the Weekend/Holiday fraud rule.
4. Email delivery infrastructure (SMTP or Azure Communication Services) is available for billing alert loops.
5. The system targets web (desktop + mobile browser) as the primary interface. A native mobile app is out of scope for this phase.
6. All monetary values are in INR (Indian Rupees). Multi-currency is out of scope.
7. The initial deployment covers a single legal entity. Multi-entity/multi-company support is out of scope for Phase 1.
8. Document uploads are limited to image files (JPEG, PNG, HEIC) and PDFs. Maximum file size per attachment: 10 MB.
9. The HOD approval threshold amount (above which MD approval is additionally required) is a configurable system parameter set at deployment.
10. The claimant's direct manager at the time of submission is the approver; mid-cycle org-chart changes do not retroactively reroute submitted claims.
