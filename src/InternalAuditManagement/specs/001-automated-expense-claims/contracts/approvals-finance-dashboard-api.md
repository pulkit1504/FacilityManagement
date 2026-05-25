# API Contract: Approvals, Finance & Dashboard

**Base URL prefix**: `/api/v1`
**Auth**: Bearer token required on all endpoints
**Error format**: RFC 7807 `ProblemDetails`

---

## Approvals API — `/api/v1/approvals`

### `GET /api/v1/approvals/queue`

Returns claims currently pending the caller's approval action. Automatically filtered to the caller's role (HOD sees their direct reports' claims; MD sees HOD claims; Finance sees operationally approved claims).

**Query parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pageSize` | int | 20 | Max 50 |
| `cursor` | string | *(none)* | Pagination cursor |

**Response `200 OK`**:
```json
{
  "items": [
    {
      "claimId": "3fa85f64-...",
      "submittedBy": "Ramesh Kumar",
      "submittedByRole": "Claimant",
      "siteName": "Ansal Heights Block A",
      "totalAmount": 3400.00,
      "lineItemCount": 3,
      "missingReceiptCount": 1,
      "submittedAt": "2026-05-20T09:15:00Z",
      "daysPending": 2,
      "urgencyLevel": "Normal"
    }
  ],
  "nextCursor": "eyJp...",
  "totalPending": 5
}
```
`urgencyLevel`: `Normal` (< 3 days) · `Attention` (3–5 days) · `Overdue` (> 5 days)

---

### `POST /api/v1/approvals/{claimId}/approve`

Approve a claim at the current pending step.

**Auth**: Caller must be the `AssignedApproverId` for the current pending `ApprovalStep`.

**Request body** (optional):
```json
{
  "remarks": "Verified site visit on 19 May"
}
```

**Side effects**:
- Sets current `ApprovalStep.Decision = Approved`.
- Advances claim status (Submitted → HodApproved → Finance queue, or → MdApproved → Finance queue).
- If advancing to Finance: creates the Finance `ApprovalStep`.
- Writes `AuditLog` entry.
- Notifies next approver or claimant via email.

**Response `200 OK`**:
```json
{
  "claimId": "3fa85f64-...",
  "newStatus": "HodApproved",
  "newStatusLabel": "Manager approved ✓ — now with Finance",
  "nextAction": "Routed to Finance team",
  "message": "Claim approved successfully."
}
```

**Errors**: `403` (not the assigned approver) · `409` (claim not in approvable state) · `404`

---

### `POST /api/v1/approvals/{claimId}/reject`

Reject a claim at the current pending step and return it to the claimant.

**Request body** (reason is **mandatory**):
```json
{
  "reason": "Receipt for line item 2 appears to be for a different date. Please resubmit with correct receipt."
}
```

**Side effects**:
- Sets claim status → `Rejected`.
- Writes `AuditLog` entry with `ActionType = REJECT` and `AuditRemarks = reason`.
- Notifies claimant via email with the rejection reason in plain English.

**Response `200 OK`**:
```json
{
  "claimId": "3fa85f64-...",
  "newStatus": "Rejected",
  "newStatusLabel": "Returned — see reason below",
  "rejectionReason": "Receipt for line item 2 appears to be for a different date...",
  "message": "Claim returned to claimant."
}
```

**Errors**: `400` (reason field empty) · `403` · `409` · `404`

---

## Finance API — `/api/v1/finance`

### `GET /api/v1/finance/queue`

Returns all claims awaiting Finance action (FinanceConfirmed status pending or PhysicalReceipt pending).

**Roles**: `Finance`, `FinanceHOD`

**Response `200 OK`**: Same structure as `GET /api/v1/approvals/queue` plus:
```json
{
  "items": [
    {
      "claimId": "...",
      "physicalReceiptRequired": true,
      "physicalReceiptConfirmed": false,
      "hasPendingBillingItems": true,
      "pendingBillingItemCount": 2,
      "totalAmount": 3400.00
    }
  ]
}
```

---

### `POST /api/v1/finance/{claimId}/confirm-physical-receipt`

Record the date and time that original vouchers were physically received by Finance. **This is required before payment can be released** (FR-009).

**Roles**: `Finance`, `FinanceHOD`

**Request body**:
```json
{
  "physicalReceiptDate": "2026-05-23",
  "physicalReceiptTime": "11:30",
  "receivedByName": "Priya Mehta"
}
```

**Side effects**:
- Sets `ExpenseClaim.PhysicalReceiptConfirmedAt` and `PhysicalReceiptConfirmedBy`.
- Writes `AuditLog` entry: `ActionType = PHYSICAL_RECEIPT_CONFIRM`.

**Response `200 OK`**:
```json
{
  "message": "Physical receipt confirmed. You can now release the payment.",
  "physicalReceiptConfirmedAt": "2026-05-23T11:30:00Z"
}
```

**Errors**: `409` (claim not in FinanceConfirmed-pending state) · `400` (invalid date/time) · `403`

---

### `POST /api/v1/finance/{claimId}/update-billing-tag`

Finance-only action to change the billable/non-billable tag of a specific line item. **Mandatory remarks required** (FR-010).

**Roles**: `Finance`, `FinanceHOD` only

**Request body**:
```json
{
  "lineItemId": "abcd-...",
  "newExpenseTag": "ContractPartCost",
  "newSiteId": "site-ansal-a",
  "newClientInvoiceNumber": null,
  "remarks": "Confirmed with site manager — this was an emergency contract overage, not billable to client."
}
```

**Side effects**:
- Updates `ExpenseLineItem.ExpenseTag`.
- Writes `AuditLog` entry: `ActionType = BILLABLE_TAG_CHANGE` with `PreActionStatus` (old tag) and `PostActionStatus` (new tag) and mandatory `AuditRemarks`.
- If changed from `PendingBilling` → resolves any active `BillingAlert` for this line item.
- If changed to `PendingBilling` → creates new `BillingAlert`.

**Response `200 OK`**:
```json
{
  "lineItemId": "abcd-...",
  "previousTag": "PendingBilling",
  "newTag": "ContractPartCost",
  "message": "Billing tag updated. Audit trail recorded."
}
```

**Errors**: `400` (empty remarks) · `403` (only Finance/FinanceHOD can change tags) · `409` · `404`

---

### `POST /api/v1/finance/{claimId}/release-payment`

Release payment for a Finance-confirmed claim. **Blocked unless physical receipt is confirmed** (FR-009).

**Roles**: `Finance`, `FinanceHOD`

**Gate checks**:
1. Claim status is `FinanceConfirmed` (operational approval complete).
2. `PhysicalReceiptConfirmedAt` is not null.

**Side effects**:
- Claim status → `PaymentReleased`.
- Writes `AuditLog` entry: `ActionType = PAYMENT_RELEASE`.
- Sends payment confirmation email to claimant.
- Triggers billing alert creation for any remaining `PendingBilling` line items (if not already created).

**Response `200 OK`**:
```json
{
  "claimId": "...",
  "newStatus": "PaymentReleased",
  "newStatusLabel": "Paid ✓",
  "message": "Payment released. Claimant has been notified."
}
```

**Errors**: `409` (physical receipt not confirmed — includes human-readable explanation) · `403` · `404`

---

### `GET /api/v1/billing/alerts`

List active billing alerts for Pending Billing items.

**Roles**: `Finance`, `FinanceHOD`, `BillingTeam`

**Query params**: `?isResolved=false&cursor=&pageSize=20`

**Response `200 OK`**:
```json
{
  "items": [
    {
      "alertId": "aaa-...",
      "lineItemId": "bbb-...",
      "claimId": "ccc-...",
      "lineItemDescription": "Cleaning supplies",
      "amount": 1200.00,
      "claimantName": "Ramesh Kumar",
      "siteName": "Ansal Heights Block A",
      "createdAt": "2026-05-20T09:15:00Z",
      "daysOpen": 5,
      "escalationLevel": "BillingTeam",
      "alertsSentCount": 2,
      "urgencyLabel": "Needs attention — 5 days pending"
    }
  ]
}
```

---

### `POST /api/v1/billing/alerts/{alertId}/link-invoice`

Link a client invoice number to a pending billing line item — resolves the alert loop.

**Roles**: `Finance`, `FinanceHOD`, `BillingTeam`

**Request body**:
```json
{
  "clientInvoiceNumber": "INV-2026-00342"
}
```

**Server behaviour**:
1. Validates invoice number against ERP billing database.
2. If ERP unreachable: accepts with `InvoiceValidationStatus = PendingErpValidation` — async revalidation job picks it up.
3. Sets `BillingAlert.IsResolved = true`.
4. Writes `AuditLog` entry.

**Response `200 OK`**:
```json
{
  "alertId": "aaa-...",
  "clientInvoiceNumber": "INV-2026-00342",
  "invoiceValidationStatus": "Valid",
  "message": "Invoice linked. Billing alert resolved ✓"
}
```

**Errors**: `400` (invoice number format invalid) · `422` (ERP returned not-found — invoice number does not exist) · `403`

---

## Dashboard API — `/api/v1/dashboard`

### `GET /api/v1/dashboard/billing-recovery`

Billing Recovery Ratio per client contract. Real-time.

**Roles**: `Finance`, `FinanceHOD`, `MD`

**Response `200 OK`**:
```json
{
  "generatedAt": "2026-05-25T10:30:00Z",
  "contracts": [
    {
      "contractId": "CTR-001",
      "clientName": "Ansal Properties",
      "totalBillableApproved": 45000.00,
      "totalBilled": 38000.00,
      "recoveryRatioPct": 84.4,
      "leakageAmount": 7000.00,
      "status": "Attention",
      "statusLabel": "84.4% recovered — ₹7,000 unbilled"
    }
  ]
}
```
`status`: `Good` (100%) · `Attention` (80–99%) · `Critical` (< 80%)

---

### `GET /api/v1/dashboard/employee-quantum`

Rolling claim behaviour per employee over 30, 60, 90 days. Flags statistical outliers (> +2σ from peer group baseline).

**Roles**: `Finance`, `FinanceHOD`, `MD`

**Response `200 OK`**:
```json
{
  "generatedAt": "2026-05-25T10:30:00Z",
  "employees": [
    {
      "employeeId": "emp-101",
      "fullName": "Ramesh Kumar",
      "department": "Housekeeping",
      "claimsLast30Days": 12,
      "amountLast30Days": 8500.00,
      "claimsLast60Days": 20,
      "amountLast60Days": 14200.00,
      "claimsLast90Days": 29,
      "amountLast90Days": 21000.00,
      "peerGroupBaseline30d": 5.2,
      "deviationSigma": 2.6,
      "isOutlier": true,
      "outlierLabel": "⚠ Claiming 2.6× above peer average — review recommended"
    }
  ]
}
```

---

### `GET /api/v1/dashboard/fraud-summary`

Summary counts and list of open fraud flags for Finance review.

**Roles**: `Finance`, `FinanceHOD`

**Response `200 OK`**:
```json
{
  "openFlagsCount": 4,
  "flagsByRule": {
    "DuplicateVoucher": 1,
    "ThresholdSplit": 2,
    "WeekendOutlier": 1
  },
  "flags": [
    {
      "flagId": "fff-...",
      "ruleName": "ThresholdSplit",
      "ruleLabel": "Threshold Split Detected",
      "ruleDescription": "3 claims submitted within 48 hours, each just below the approval limit",
      "primaryClaimId": "...",
      "relatedClaimCount": 3,
      "flaggedAt": "2026-05-25T02:15:00Z",
      "daysOpen": 0,
      "employeeName": "Ramesh Kumar"
    }
  ]
}
```

---

### `POST /api/v1/dashboard/fraud-flags/{flagId}/review`

Review and resolve or escalate a fraud flag. Mandatory remarks.

**Roles**: `Finance`, `FinanceHOD`

**Request body**:
```json
{
  "decision": "Cleared",
  "remarks": "Verified with site manager — three separate purchases from different vendors on same day. Legitimate."
}
```
`decision`: `Cleared` or `Escalated`

**Side effects**:
- Updates `FraudFlag.Status`.
- Writes `AuditLog` entries for each related claim: `ActionType = FRAUD_CLEAR` or `FRAUD_ESCALATE`.

**Response `200 OK`**:
```json
{
  "flagId": "fff-...",
  "decision": "Cleared",
  "message": "Flag cleared. Audit trail recorded."
}
```

---

## Health Endpoints — `/api/v1/health`

### `GET /api/v1/health`

Liveness probe. Returns `200 OK` if the process is running.

**Auth**: None required.

**Response `200 OK`**:
```json
{
  "status": "Healthy",
  "version": "1.0.0",
  "timestamp": "2026-05-25T10:30:00Z"
}
```

---

### `GET /api/v1/health/ready`

Readiness probe. Checks database connectivity, Blob Storage accessibility, and Key Vault reachability.

**Auth**: None required.

**Response `200 OK`** (all healthy):
```json
{
  "status": "Healthy",
  "checks": {
    "database": "Healthy",
    "blobStorage": "Healthy",
    "keyVault": "Healthy"
  }
}
```

**Response `503 Service Unavailable`** (any dependency unhealthy):
```json
{
  "status": "Unhealthy",
  "checks": {
    "database": "Unhealthy — connection timeout",
    "blobStorage": "Healthy",
    "keyVault": "Healthy"
  }
}
```
