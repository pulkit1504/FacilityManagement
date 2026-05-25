# API Contract: Claims

**Base URL**: `/api/v1/claims`
**Auth**: Bearer token required on all endpoints
**Error format**: RFC 7807 `ProblemDetails` — `{ type, title, status, detail, traceId }`
**Pagination**: Cursor-based — `?cursor=<opaque>&pageSize=<int>` — response includes `nextCursor`

---

## `GET /api/v1/claims`

List the caller's own claims (Claimant) or subordinates' claims (HOD/MD/Finance).

**Query parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | *(all)* | Filter by status name, e.g. `Submitted`, `Rejected` |
| `from` | date | *(none)* | ISO 8601 date — filter by `CreatedAt >= from` |
| `to` | date | *(none)* | ISO 8601 date — filter by `CreatedAt <= to` |
| `siteId` | string | *(all)* | Filter by site |
| `cursor` | string | *(none)* | Opaque pagination cursor |
| `pageSize` | int | 20 | Max 100 |

**Response `200 OK`**:
```json
{
  "items": [
    {
      "claimId": "3fa85f64-...",
      "submissionMode": "SingleVoucher",
      "status": "Submitted",
      "statusLabel": "Waiting for your manager",
      "totalAmount": 1250.00,
      "lineItemCount": 3,
      "missingReceiptCount": 1,
      "createdAt": "2026-05-20T09:15:00Z",
      "siteId": "site-ansal-a",
      "siteName": "Ansal Heights Block A"
    }
  ],
  "nextCursor": "eyJpZCI6Ijg...",
  "totalCount": 42
}
```

**Errors**: `401` (no token) · `403` (role cannot list) · `400` (invalid query params)

---

## `POST /api/v1/claims`

Create a new claim in **Draft** status. Auto-saves immediately.

**Request body**:
```json
{
  "submissionMode": "SingleVoucher",
  "siteId": "site-ansal-a",
  "proformaPeriodStart": null,
  "proformaPeriodEnd": null
}
```
For Proforma: `submissionMode = "Proforma"` and both period fields are required.

**Response `201 Created`**:
```json
{
  "claimId": "3fa85f64-...",
  "status": "Draft",
  "statusLabel": "Draft — not yet submitted",
  "createdAt": "2026-05-25T10:30:00Z"
}
```
`Location` header: `/api/v1/claims/{claimId}`

**Errors**: `400` (validation — missing period dates for Proforma) · `401` · `403`

---

## `GET /api/v1/claims/{claimId}`

Get full claim detail including line items, attachments, and approval steps.

**Response `200 OK`**:
```json
{
  "claimId": "3fa85f64-...",
  "submissionMode": "SingleVoucher",
  "status": "HodApproved",
  "statusLabel": "Manager approved ✓ — now with Finance",
  "totalAmount": 3400.00,
  "submittedBy": {
    "employeeId": "emp-101",
    "fullName": "Ramesh Kumar"
  },
  "siteId": "site-ansal-a",
  "siteName": "Ansal Heights Block A",
  "createdAt": "2026-05-20T09:15:00Z",
  "updatedAt": "2026-05-21T14:05:00Z",
  "lineItems": [
    {
      "lineItemId": "abcd-...",
      "description": "Cleaning supplies purchase",
      "amount": 1200.00,
      "transactionDate": "2026-05-19",
      "expenseTag": "PendingBilling",
      "expenseTagLabel": "Pending Billing — client should be invoiced",
      "clientInvoiceNumber": null,
      "missingReceiptFlag": false,
      "attachments": [
        {
          "attachmentId": "fff0-...",
          "originalFileName": "receipt-may19.jpg",
          "contentType": "image/jpeg",
          "fileSizeBytes": 245760,
          "uploadedAt": "2026-05-20T09:12:00Z"
        }
      ]
    }
  ],
  "approvalSteps": [
    {
      "stepOrder": 1,
      "requiredApproverRole": "HOD",
      "assignedApproverName": "Sunil Sharma",
      "decision": "Approved",
      "decisionAt": "2026-05-21T14:05:00Z"
    },
    {
      "stepOrder": 2,
      "requiredApproverRole": "Finance",
      "assignedApproverName": null,
      "decision": "Pending",
      "decisionAt": null
    }
  ]
}
```

**Errors**: `401` · `403` (can only view own or authorised claims) · `404`

---

## `PATCH /api/v1/claims/{claimId}`

Update a **Draft** claim's top-level fields. Only allowed while status = `Draft`.

**Request body** (all fields optional):
```json
{
  "siteId": "site-ansal-b",
  "proformaPeriodStart": "2026-05-01",
  "proformaPeriodEnd": "2026-05-15"
}
```

**Response `200 OK`**: Updated claim summary.

**Errors**: `400` (cannot edit non-Draft claim) · `409` (concurrency conflict — `rowVersion` mismatch, retry) · `401` · `403` · `404`

---

## `POST /api/v1/claims/{claimId}/line-items`

Add a line item to a Draft claim.

**Request body**:
```json
{
  "description": "Cleaning supplies purchase",
  "amount": 1200.00,
  "transactionDate": "2026-05-19",
  "expenseTag": "PendingBilling",
  "clientInvoiceNumber": null,
  "siteId": null,
  "sortOrder": 1
}
```

**Validation**:
- `expenseTag = "AlreadyBilled"` → `clientInvoiceNumber` required.
- `expenseTag = "ContractPartCost"` → `siteId` required.
- `amount` must be > 0.
- `transactionDate` cannot be in the future.
- For Proforma claims: `transactionDate` must be within the claim's period window.

**Response `201 Created`**:
```json
{
  "lineItemId": "abcd-...",
  "missingReceiptFlag": true,
  "message": "Line item added. Don't forget to attach a receipt!"
}
```

**Errors**: `400` (validation) · `409` (claim not in Draft) · `401` · `403` · `404`

---

## `PUT /api/v1/claims/{claimId}/line-items/{lineItemId}`

Replace a line item. Only on Draft claims.

**Request body**: Same as `POST /line-items`.
**Response `200 OK`**: Updated line item.

---

## `DELETE /api/v1/claims/{claimId}/line-items/{lineItemId}`

Soft-delete a line item. Only on Draft claims.
**Response `204 No Content`**

---

## `POST /api/v1/claims/{claimId}/line-items/{lineItemId}/attachments`

Upload a receipt attachment for a line item. `Content-Type: multipart/form-data`.

**Form fields**:
| Field | Type | Notes |
|-------|------|-------|
| `file` | binary | JPEG, PNG, HEIC, or PDF only. Max 10 MB. |

**Server behaviour**:
1. Validates file type and size.
2. Computes SHA-256 hash of file bytes.
3. Uploads to Azure Blob (`{claimId}/{lineItemId}/{attachmentId}.ext`).
4. Saves `ExpenseAttachment` record with hash.
5. Sets `ExpenseLineItem.MissingReceiptFlag = false`.

**Response `201 Created`**:
```json
{
  "attachmentId": "fff0-...",
  "originalFileName": "receipt.jpg",
  "fileSizeBytes": 245760,
  "message": "Receipt attached ✓"
}
```

**Errors**: `400` (invalid file type/size) · `409` (claim not in editable state) · `413` (file too large) · `401` · `403`

---

## `GET /api/v1/claims/{claimId}/line-items/{lineItemId}/attachments/{attachmentId}/download`

Get a time-limited (15-minute) SAS download URL for a receipt. Never returns a permanent URL.

**Response `200 OK`**:
```json
{
  "downloadUrl": "https://storage.blob.core.windows.net/receipts/...?sv=...&se=...&sig=...",
  "expiresAt": "2026-05-25T10:45:00Z",
  "originalFileName": "receipt.jpg"
}
```

---

## `POST /api/v1/claims/{claimId}/submit`

Submit a Draft claim for approval. Performs all submission-gate validations.

**Gate checks** (all must pass):
1. Claim is in `Draft` status.
2. At least one line item exists.
3. For Proforma: at least 2 line items exist (FR-002 bulk-sum block).
4. All `AlreadyBilled` line items have a non-empty `ClientInvoiceNumber`.
5. All `ContractPartCost` line items have a `SiteId`.

**Side effects on success**:
- Claim status → `Submitted`.
- `ApprovalSteps` created from org-chart lookup.
- `AuditLog` entry written: `ActionType = SUBMIT`.
- Assigned approver notified via email.

**Response `200 OK`**:
```json
{
  "status": "Submitted",
  "statusLabel": "Submitted — waiting for your manager",
  "assignedTo": "Sunil Sharma (HOD)",
  "message": "Your claim has been submitted successfully."
}
```

**Errors**: `409` (gate check failures — body describes which checks failed) · `400` · `401` · `403`

---

## `GET /api/v1/claims/{claimId}/audit-log`

Retrieve the complete immutable audit trail for a claim.

**Response `200 OK`**:
```json
{
  "claimId": "3fa85f64-...",
  "entries": [
    {
      "logId": 1001,
      "actionTimestamp": "2026-05-20T09:15:00Z",
      "actorUserId": "emp-101",
      "actorName": "Ramesh Kumar",
      "actionType": "SUBMIT",
      "actionLabel": "Submitted for approval",
      "preActionStatus": "Draft",
      "postActionStatus": "Submitted",
      "auditRemarks": null
    },
    {
      "logId": 1045,
      "actionTimestamp": "2026-05-21T14:05:00Z",
      "actorUserId": "emp-220",
      "actorName": "Sunil Sharma",
      "actionType": "HOD_APPROVE",
      "actionLabel": "Approved by manager",
      "preActionStatus": "Submitted",
      "postActionStatus": "HodApproved",
      "auditRemarks": null
    }
  ]
}
```
