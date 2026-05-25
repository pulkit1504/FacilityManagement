# Data Model: Automated Expense Claims Mechanism

**Phase 1 output** | Branch: `001-automated-expense-claims` | Date: 2026-05-25

---

## Entity Relationship Overview

```
Employee ──────────────────────────────────────────────────────────────
   │ (1:many, self-ref DirectManagerId)                                │
   │                                                                   │
   │ submits                                                            │
   ▼                                                                   │
ExpenseClaim ──────────────────────────────────────────────────────    │
   │ (1:many)         (1:many)               (1:many)             │    │
   │                  │                      │                    │    │
   ▼                  ▼                      ▼                    │    │
ExpenseLineItem   ApprovalStep           AuditLog                │    │
   │ (1:many)     (ordered steps)        (append-only)           │    │
   │                                                              │    │
   ▼                                                              │    │
ExpenseAttachment                                                 │    │
  (SHA-256 hash)                                                  │    │
                                                                  │    │
ExpenseLineItem ──── BillingAlert (1:1, Pending Billing only)    │    │
ExpenseLineItem ──── FraudFlag    (many:many via FraudFlagClaim)  │    │
                                                                  │    │
ClientContract ──── ContractSite ──── Site ◄──────────────────── │    │
                                                                       │
Employee.DirectManagerId self-references Employee ─────────────────────
```

---

## Claim Status State Machine

```
                   ┌─────────┐
                   │  Draft  │ ← auto-saved, claimant only
                   └────┬────┘
                        │ submit (FR-002 itemisation gate)
                        ▼
                   ┌──────────┐
                   │Submitted │ ─── routed to HOD or MD (FR-007)
                   └────┬─────┘
                        │
          ┌─────────────┼──────────────┐
          │ HOD approves│              │ HOD rejects
          ▼             │              ▼
   ┌────────────┐       │         ┌──────────┐
   │HodApproved │       │         │ Rejected │ ← mandatory reason
   └─────┬──────┘       │         └──────────┘
         │              │                ▲
         │ (if HOD      │ claimant is HOD│
         │  route)      │ → goes to MD   │ reject at any stage
         │              ▼
         │        ┌────────────┐
         │        │ MdApproved │
         │        └─────┬──────┘
         │              │
         └──────────────┤  both routes arrive at Finance
                        ▼
               ┌──────────────────┐
               │FinanceConfirmed  │ ← physical receipt gate (FR-009)
               └────────┬─────────┘
                        │ release payment
                        ▼
               ┌──────────────────┐
               │ PaymentReleased  │ ← terminal state
               └──────────────────┘
```

---

## Table Definitions

### `ExpenseClaims`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `ClaimId` | `uniqueidentifier` | PK, default `NEWID()` | |
| `SubmitterEmployeeId` | `varchar(100)` | FK → `Employees.EmployeeId`, NOT NULL | |
| `SubmissionMode` | `tinyint` | NOT NULL | 0=SingleVoucher, 1=Proforma |
| `ProformaPeriodStart` | `date` | NULL | Required when Mode=Proforma |
| `ProformaPeriodEnd` | `date` | NULL | Required when Mode=Proforma |
| `Status` | `tinyint` | NOT NULL, default 0 | See state machine above |
| `TotalAmount` | `decimal(18,2)` | NOT NULL, default 0 | Computed from line items |
| `SiteId` | `varchar(100)` | FK → `Sites.SiteId`, NULL | For site-level margin tracking |
| `RejectionReason` | `nvarchar(1000)` | NULL | Populated on Rejected status |
| `PhysicalReceiptConfirmedAt` | `datetimeoffset` | NULL | Set by Finance (FR-009) |
| `PhysicalReceiptConfirmedBy` | `varchar(100)` | NULL | Finance user ID |
| `CreatedAt` | `datetimeoffset` | NOT NULL, default `SYSUTCDATETIME()` | |
| `UpdatedAt` | `datetimeoffset` | NOT NULL | Updated on every write |
| `RowVersion` | `rowversion` | NOT NULL | Optimistic concurrency (EF `IsConcurrencyToken`) |
| `IsDeleted` | `bit` | NOT NULL, default 0 | Soft delete — never hard delete |

**Validation rules**:
- If `SubmissionMode = 1` (Proforma): `ProformaPeriodStart` and `ProformaPeriodEnd` must both be non-null and `ProformaPeriodEnd > ProformaPeriodStart`.
- `Status` transitions must follow the state machine — invalid transitions rejected at application layer.

---

### `ExpenseLineItems`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `LineItemId` | `uniqueidentifier` | PK, default `NEWID()` | |
| `ClaimId` | `uniqueidentifier` | FK → `ExpenseClaims.ClaimId`, NOT NULL, CASCADE DELETE | |
| `Description` | `nvarchar(500)` | NOT NULL | Min 3 chars, max 500 |
| `Amount` | `decimal(18,2)` | NOT NULL, CHECK > 0 | Must be positive |
| `TransactionDate` | `date` | NOT NULL | Cannot be future-dated |
| `ExpenseTag` | `tinyint` | NOT NULL | 0=AlreadyBilled, 1=PendingBilling, 2=ContractPartCost, 3=BackendCTC |
| `ClientInvoiceNumber` | `varchar(100)` | NULL | Required when `ExpenseTag = 0` |
| `InvoiceValidationStatus` | `tinyint` | NOT NULL, default 2 | 0=Valid, 1=Invalid, 2=NotApplicable, 3=PendingErpValidation |
| `BillingAlertCreated` | `bit` | NOT NULL, default 0 | Set when alert loop is initiated |
| `SiteId` | `varchar(100)` | FK → `Sites.SiteId`, NULL | Required when `ExpenseTag = 2` (Contract Part) |
| `MissingReceiptFlag` | `bit` | NOT NULL, default 1 | 1=missing, 0=attached. Defaults to missing; cleared when attachment uploaded |
| `SortOrder` | `int` | NOT NULL | Preserves user-defined display order |
| `CreatedAt` | `datetimeoffset` | NOT NULL, default `SYSUTCDATETIME()` | |
| `IsDeleted` | `bit` | NOT NULL, default 0 | Soft delete |

**Validation rules**:
- `ExpenseTag = 0` (AlreadyBilled): `ClientInvoiceNumber` must be non-null and non-empty.
- `ExpenseTag = 2` (ContractPartCost): `SiteId` must be non-null.
- `TransactionDate` for Proforma: must fall within `ExpenseClaim.ProformaPeriodStart`–`ProformaPeriodEnd`.
- Proforma claims: minimum 2 line items required (FR-002 block on bulk-sum entry).

---

### `ExpenseAttachments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `AttachmentId` | `uniqueidentifier` | PK, default `NEWID()` | |
| `LineItemId` | `uniqueidentifier` | FK → `ExpenseLineItems.LineItemId`, NOT NULL | |
| `StoragePath` | `varchar(1000)` | NOT NULL | Azure Blob relative path (never a public URL) |
| `ContentHash` | `char(64)` | NOT NULL | SHA-256 hex string — stored at upload time |
| `OriginalFileName` | `varchar(255)` | NOT NULL | |
| `FileSizeBytes` | `int` | NOT NULL, CHECK > 0 | Max 10 MB enforced at application layer |
| `ContentType` | `varchar(100)` | NOT NULL | Allowed: `image/jpeg`, `image/png`, `image/heic`, `application/pdf` |
| `UploadedAt` | `datetimeoffset` | NOT NULL, default `SYSUTCDATETIME()` | |
| `UploadedByUserId` | `varchar(100)` | NOT NULL | |

**Notes**:
- On upload: server computes SHA-256 of the file bytes; stores hash in DB; uploads to Blob with the same name pattern `{claimId}/{lineItemId}/{attachmentId}.ext`.
- On download: server re-computes SHA-256 from Blob and compares against DB — mismatch triggers an alert.
- Upload clears `ExpenseLineItems.MissingReceiptFlag`.

---

### `AuditLog` *(append-only — no UPDATE or DELETE permitted at DB level)*

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `LogId` | `bigint` | PK, IDENTITY(1,1) | Auto-increment |
| `ClaimId` | `varchar(36)` | NOT NULL | String FK (not uniqueidentifier) to allow future cross-entity logging |
| `ActionTimestamp` | `datetimeoffset` | NOT NULL, default `SYSUTCDATETIME()` | System-generated — never user-supplied |
| `ActorUserId` | `varchar(100)` | NOT NULL | Employee ID of the person triggering the action |
| `ActionType` | `varchar(50)` | NOT NULL | See enum below |
| `PreActionStatus` | `varchar(100)` | NULL | Status before the action |
| `PostActionStatus` | `varchar(100)` | NOT NULL | Status after the action |
| `AuditRemarks` | `nvarchar(2000)` | NULL | **Mandatory** when `ActionType IN ('REJECT', 'BILLABLE_TAG_CHANGE')` |
| `IpAddress` | `varchar(45)` | NULL | IPv4 or IPv6 from request context |
| `CorrelationId` | `varchar(36)` | NULL | HTTP request correlation ID |

**`ActionType` enum values**:
`SUBMIT` · `HOD_APPROVE` · `MD_APPROVE` · `FINANCE_CONFIRM` · `PAYMENT_RELEASE` · `REJECT` · `BILLABLE_TAG_CHANGE` · `FRAUD_FLAG` · `FRAUD_CLEAR` · `FRAUD_ESCALATE` · `PHYSICAL_RECEIPT_CONFIRM` · `DRAFT_SAVED`

**Enforcement**: EF Core entity configured with no `DbSet` update/delete methods. SQL grants: `GRANT INSERT ON AuditLog TO app_user; DENY UPDATE, DELETE ON AuditLog TO app_user;`

---

### `ApprovalSteps`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `StepId` | `uniqueidentifier` | PK, default `NEWID()` | |
| `ClaimId` | `uniqueidentifier` | FK → `ExpenseClaims.ClaimId`, NOT NULL | |
| `StepOrder` | `int` | NOT NULL | 1=HOD or MD, 2=Finance |
| `RequiredApproverRole` | `varchar(50)` | NOT NULL | HOD / MD / Finance |
| `AssignedApproverId` | `varchar(100)` | NOT NULL | Resolved from org-chart at submission time |
| `Decision` | `varchar(20)` | NOT NULL, default 'Pending' | Pending / Approved / Rejected |
| `DecisionAt` | `datetimeoffset` | NULL | |
| `Remarks` | `nvarchar(1000)` | NULL | |

---

### `BillingAlerts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `AlertId` | `uniqueidentifier` | PK, default `NEWID()` | Also used as idempotency key |
| `LineItemId` | `uniqueidentifier` | FK → `ExpenseLineItems.LineItemId`, NOT NULL | |
| `ClaimId` | `uniqueidentifier` | NOT NULL | Denormalized for fast querying |
| `CreatedAt` | `datetimeoffset` | NOT NULL | |
| `LastSentAt` | `datetimeoffset` | NULL | Updated each time a reminder is sent |
| `NextSendAt` | `datetimeoffset` | NOT NULL | Set to CreatedAt + 48h initially |
| `EscalationLevel` | `tinyint` | NOT NULL, default 0 | 0=BillingTeam, 1=FinanceHOD |
| `AlertsSentCount` | `int` | NOT NULL, default 0 | |
| `IsResolved` | `bit` | NOT NULL, default 0 | |
| `ResolvedAt` | `datetimeoffset` | NULL | |
| `ResolvedByUserId` | `varchar(100)` | NULL | |

---

### `FraudFlags`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `FlagId` | `uniqueidentifier` | PK | |
| `PrimaryClaimId` | `uniqueidentifier` | FK → `ExpenseClaims.ClaimId`, NOT NULL | |
| `RelatedClaimIds` | `nvarchar(max)` | NULL | JSON array `["id1","id2"]` for multi-claim rules |
| `RuleName` | `varchar(50)` | NOT NULL | `DuplicateVoucher`, `ThresholdSplit`, `WeekendOutlier` |
| `FlaggedAt` | `datetimeoffset` | NOT NULL | |
| `SweepDate` | `date` | NOT NULL | Date the nightly sweep ran |
| `Status` | `varchar(20)` | NOT NULL, default 'Open' | `Open`, `Cleared`, `Escalated` |
| `ReviewedByUserId` | `varchar(100)` | NULL | |
| `ReviewRemarks` | `nvarchar(1000)` | NULL | Mandatory when resolving |
| `ReviewedAt` | `datetimeoffset` | NULL | |

---

### `Employees`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `EmployeeId` | `varchar(100)` | PK | Azure AD Object ID |
| `FullName` | `nvarchar(200)` | NOT NULL | |
| `Email` | `varchar(255)` | NOT NULL, UNIQUE | |
| `Department` | `nvarchar(100)` | NOT NULL | |
| `JobTitle` | `nvarchar(100)` | NOT NULL | |
| `Role` | `varchar(50)` | NOT NULL | Claimant / HOD / MD / Finance / BillingTeam / FinanceHOD |
| `DirectManagerId` | `varchar(100)` | FK → `Employees.EmployeeId`, NULL | NULL for MD (top of hierarchy) |
| `IsHod` | `bit` | NOT NULL, default 0 | |
| `ApprovalThresholdAmount` | `decimal(18,2)` | NOT NULL, default 0 | HOD can approve up to this amount; above routes to MD |
| `IsActive` | `bit` | NOT NULL, default 1 | |
| `LastSyncedAt` | `datetimeoffset` | NULL | From HR system integration |

---

### `ClientContracts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `ContractId` | `varchar(100)` | PK | |
| `ClientName` | `nvarchar(200)` | NOT NULL | |
| `Description` | `nvarchar(500)` | NULL | |
| `StartDate` | `date` | NOT NULL | |
| `EndDate` | `date` | NULL | NULL = ongoing |
| `IsActive` | `bit` | NOT NULL, default 1 | |

### `Sites`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `SiteId` | `varchar(100)` | PK | |
| `SiteName` | `nvarchar(200)` | NOT NULL | e.g., "Ansal Heights Block A" |
| `SiteAddress` | `nvarchar(500)` | NULL | |
| `ServiceType` | `varchar(20)` | NOT NULL | `Housekeeping`, `Security`, `Both` |
| `ContractId` | `varchar(100)` | FK → `ClientContracts.ContractId`, NULL | |
| `IsActive` | `bit` | NOT NULL, default 1 | |

### `Holidays`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `HolidayDate` | `date` | PK | |
| `HolidayName` | `nvarchar(200)` | NOT NULL | |
| `IsNational` | `bit` | NOT NULL, default 1 | |

---

## Indexes

```sql
-- Performance: approval queue lookups
CREATE INDEX IX_Claims_SubmitterEmployeeId ON ExpenseClaims(SubmitterEmployeeId) WHERE IsDeleted = 0;
CREATE INDEX IX_Claims_Status ON ExpenseClaims(Status) WHERE IsDeleted = 0;

-- Performance: audit log retrieval by claim
CREATE INDEX IX_AuditLog_ClaimId ON AuditLog(ClaimId);
CREATE INDEX IX_AuditLog_ActionTimestamp ON AuditLog(ActionTimestamp DESC);

-- Performance: billing alert loop job
CREATE INDEX IX_BillingAlerts_NextSendAt ON BillingAlerts(NextSendAt) WHERE IsResolved = 0;

-- Performance: fraud sweep duplicate check
CREATE INDEX IX_LineItems_TransactionDate_Amount ON ExpenseLineItems(TransactionDate, Amount) WHERE IsDeleted = 0;

-- Performance: employee hierarchy traversal
CREATE INDEX IX_Employees_DirectManagerId ON Employees(DirectManagerId) WHERE IsActive = 1;
```

---

## Billing Recovery Ratio — Computed View

```sql
CREATE VIEW vw_BillingRecoveryRatio AS
SELECT
    cc.ContractId,
    cc.ClientName,
    SUM(CASE WHEN li.ExpenseTag IN (0, 1) THEN li.Amount ELSE 0 END) AS TotalBillableApproved,
    SUM(CASE WHEN li.ExpenseTag = 0 AND li.InvoiceValidationStatus = 0 THEN li.Amount ELSE 0 END) AS TotalBilled,
    CASE
        WHEN SUM(CASE WHEN li.ExpenseTag IN (0, 1) THEN li.Amount ELSE 0 END) = 0 THEN NULL
        ELSE ROUND(
            SUM(CASE WHEN li.ExpenseTag = 0 AND li.InvoiceValidationStatus = 0 THEN li.Amount ELSE 0 END) * 100.0
            / SUM(CASE WHEN li.ExpenseTag IN (0, 1) THEN li.Amount ELSE 0 END),
            2
        )
    END AS BillingRecoveryRatioPct
FROM ExpenseClaims ec
JOIN ExpenseLineItems li ON li.ClaimId = ec.ClaimId AND li.IsDeleted = 0
JOIN Sites s ON s.SiteId = ec.SiteId
JOIN ClientContracts cc ON cc.ContractId = s.ContractId
WHERE ec.Status >= 4  -- FinanceConfirmed or PaymentReleased
  AND ec.IsDeleted = 0
GROUP BY cc.ContractId, cc.ClientName;
```
