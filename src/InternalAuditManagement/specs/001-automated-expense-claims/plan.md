# Implementation Plan: Automated Expense Claims Mechanism

**Branch**: `001-automated-expense-claims` | **Date**: 2026-05-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-automated-expense-claims/spec.md`

## Summary

Build a closed-loop, fully auditable expense claims system for a Facility Management company operating housekeeping and security services across residential society sites. Field staff submit itemised expense claims via a mobile-friendly web wizard, which are routed through dynamic org-chart-based approvals, enforce billable/non-billable tagging with automated client billing alerts, gate payment on physical receipt confirmation, and run nightly fraud detection sweeps — all backed by an immutable audit trail.

**Technology approach**: Next.js 15 (Vercel, free) frontend + .NET 9 Azure Functions Consumption Plan (free) backend + Azure SQL Serverless + Azure Blob Storage — targeting **₹0/month** operating cost for the first 12 months.

## Technical Context

**Language/Version**: C# .NET 9 (Azure Functions v4, Isolated Worker) + TypeScript 5.5 / Next.js 15 (App Router)

**Primary Dependencies**:
- *Backend*: `Microsoft.Azure.Functions.Worker`, `Microsoft.EntityFrameworkCore` 9, `Microsoft.Identity.Web`, `Polly` 8, `FluentValidation`, `Azure.Storage.Blobs`, `Azure.Communication.Email`, `Azure.Security.KeyVault.Secrets`, `Serilog.Sinks.ApplicationInsights`
- *Frontend*: `next` 15, `react` 19, `tailwindcss` 4, `react-hook-form`, `zod`, `@tanstack/react-query` 5, `next-auth` (Azure AD provider)

**Storage**: Azure SQL Database Serverless via EF Core 9 code-first migrations; Azure Blob Storage LRS for encrypted receipt files

**Testing**: xUnit + Moq + FluentAssertions (backend unit); TestContainers + Azure SQL Edge (backend integration); Jest + React Testing Library (frontend unit); Playwright (E2E)

**Target Platform**: Vercel (frontend, free Hobby tier) + Azure Functions Consumption Plan (backend, 1M free executions/month)

**Project Type**: Full-stack web application — REST API (Azure Functions) + React frontend (Next.js)

**Performance Goals**:
- Claim CRUD API: p95 < 500 ms
- Dashboard queries: p95 < 2 s
- Dashboard data freshness: ≤ 60 s after Finance confirmation
- Nightly fraud sweep: complete before 07:00 AM daily

**Constraints**: ₹0/month first 12 months; mobile browser compatible (no native app); all secrets via Azure Key Vault; AES-256 at rest for uploaded files; no hardcoded credentials

**Scale/Scope**: 20–100 field employees · 5–20 residential society sites · 10–50 claims/day · 3–5 concurrent approvers

## Constitution Check

*GATE: Evaluated before Phase 0 research. Re-checked after Phase 1 design — all gates pass.*

- [x] **I. Zero-Trust Security**: Azure Entra ID Bearer tokens required on all endpoints; RBAC via Azure AD role claims (Claimant / HOD / MD / Finance / BillingTeam / FinanceHOD); all secrets in Azure Key Vault; rate limiting via Azure Functions `host.json`; security headers middleware; RFC 7807 errors — no stack traces to client.
- [x] **II. Clean Architecture**: `Domain/` → `Application/` → `Infrastructure/` (injected via interfaces); Azure Function HTTP triggers are thin controllers (validate → call one application service → map response); `Domain/` has zero references to EF Core or Azure SDK types.
- [x] **III. Audit Trail & Data Integrity**: `AuditLog` table is append-only — no EF `Update`/`Delete` on that entity, SQL `DENY DELETE, UPDATE` applied at DB level; all claim entities carry `IsDeleted` soft-delete flag; `ExpenseClaim.RowVersion` (EF `IsConcurrencyToken`) for optimistic concurrency; all timestamps `DateTimeOffset` UTC.
- [x] **IV. Resilience & Reliability**: `Polly` `ResiliencePipeline` (3× exponential backoff + circuit breaker) on ERP invoice validation, Azure Blob, and Email calls; `CancellationToken` on every `async` method signature; `/health` (liveness) and `/health/ready` (readiness with DB + Blob checks); billing alert `AlertId` used as idempotency key; graceful shutdown via `IHostApplicationLifetime`.
- [x] **V. Observability**: Serilog + Application Insights sink; `X-Correlation-Id` middleware injects `CorrelationId` into `ILogger` scope on every request; log fields use entity IDs only — no amounts or personal data; `TelemetryClient` custom metrics: `claims.submitted`, `approvals.pending_count`, `fraud.flags_open`.
- [x] **VI. Testing Discipline**: TDD for all `Domain/` and `Application/` classes; coverage gate ≥80% enforced in CI via `coverlet`; every authenticated endpoint has a 401 and 403 negative-path test; `ISystemClock` injectable abstraction for time — no `DateTime.UtcNow` in business code.
- [x] **VII. API Design Standards**: All routes under `/api/v1/`; plural resource nouns; RFC 7807 `ProblemDetails` for all 4xx/5xx; Swashbuckle OpenAPI auto-generated; cursor pagination (`?cursor=&pageSize=`) on all list endpoints; `GET` endpoints are side-effect-free.

## UX Philosophy — Simplicity First

This system is used by **housekeeping supervisors and security guards in the field**, often on mobile phones with intermittent connectivity. The UX must feel as easy as WhatsApp, not as complex as an ERP form.

### Design Principles

1. **Step-by-step wizard, not one giant form** — Claim submission has 4 named steps, each fitting one phone screen: ① Claim Details → ② Add Line Items → ③ Attach Receipts → ④ Review & Submit. Users cannot advance until the current step is valid.

2. **Plain English everywhere** — Status labels use everyday language:

   | System State | What the user sees |
   |---|---|
   | `Submitted` | Submitted — waiting for your manager |
   | `HodApproved` | Manager approved ✓ — now with Finance |
   | `MdApproved` | Director approved ✓ — now with Finance |
   | `FinanceConfirmed` | Finance confirmed ✓ — payment being processed |
   | `PaymentReleased` | Paid ✓ |
   | `Rejected` | Returned — see reason below |

3. **Camera-first receipt capture** — On mobile, the "Add Receipt" button opens the device camera directly. No file browser required. Each line item shows a green ✓ (receipt attached) or an amber ⚠ (missing — flagged but allowed).

4. **Smart defaults that reduce typing** — Transaction date defaults to today. Last-used site pre-fills. Most-recently-used expense tags appear first in the dropdown.

5. **Auto-save drafts, never lose work** — Every field change auto-saves a draft within 2 seconds via debounced API call. Users can close the browser mid-form and return to exactly where they left off.

6. **Traffic-light dashboards** — Finance and HOD dashboards use colour-coded summary cards (🟢 on track / 🟡 needs attention ≤7 days / 🔴 critical or fraud-flagged). Card counts at a glance; drill down only when needed.

7. **One-tap approval actions** — Each approval card has a large "Approve" button (green) and a smaller "Return with reason" link. No navigation required. On mobile, swipe right to approve, swipe left to return.

8. **Contextual inline help** — Every expense tag has a ⓘ tooltip in plain language:
   - *Already Billed* → "You've already sent an invoice to the client for this expense"
   - *Pending Billing* → "Client should be billed — Finance will chase the invoice"
   - *Contract Part Cost* → "Absorbed by the company as part of this site's contract"
   - *Backend CTC* → "Internal company overhead, not linked to any site or client"

## Project Structure

### Documentation (this feature)

```text
specs/001-automated-expense-claims/
├── plan.md              # This file
├── research.md          # Technology decisions and rationale
├── data-model.md        # Entity schema, relationships, state machines
├── quickstart.md        # Developer setup guide (get running in 15 minutes)
├── contracts/
│   ├── claims-api.md        # Claims CRUD + submission endpoints
│   ├── approvals-api.md     # Approval workflow endpoints
│   ├── finance-api.md       # Finance reconciliation + payment endpoints
│   └── dashboard-api.md     # MIS dashboard + fraud review endpoints
└── tasks.md             # Generated by /speckit.tasks (next step)
```

### Source Code Layout

```text
src/InternalAuditManagement/
│
├── backend/
│   ├── src/
│   │   ├── Domain/                        # Pure C# — zero infrastructure dependencies
│   │   │   ├── Entities/                  # ExpenseClaim, ExpenseLineItem, AuditLog …
│   │   │   ├── ValueObjects/              # Money, ExpenseTag, ClaimStatus
│   │   │   ├── DomainEvents/              # ClaimSubmitted, ClaimApproved, FraudFlagged
│   │   │   └── Interfaces/                # IClaimRepository, IAuditLogger, IAttachmentStore
│   │   ├── Application/                   # Use cases, DTOs, validators, response mappers
│   │   │   ├── Claims/                    # SubmitClaim, GetClaim, ListClaims …
│   │   │   ├── Approvals/                 # ApproveHod, ApproveMd, RejectClaim
│   │   │   ├── Finance/                   # ConfirmPhysicalReceipt, UpdateBillingTag, ReleasePayment
│   │   │   ├── Fraud/                     # NightlyFraudSweep, ReviewFraudFlag
│   │   │   └── Dashboard/                 # BillingRecoveryQuery, EmployeeQuantumQuery
│   │   ├── Infrastructure/                # EF Core, Blob, Email, Key Vault — implements interfaces
│   │   │   ├── Persistence/               # AppDbContext, EF migrations, repositories
│   │   │   ├── Storage/                   # BlobAttachmentStore (SHA-256 hash, AES-256 at rest)
│   │   │   ├── Email/                     # AzureCommunicationEmailSender
│   │   │   └── ExternalServices/          # ErpBillingClient (Polly retry + circuit breaker)
│   │   └── Functions/                     # Azure Functions — thin entry points only
│   │       ├── Http/                      # ClaimsFunction, ApprovalsFunction, FinanceFunction …
│   │       ├── Timers/                    # NightlyFraudSweepFunction (02:00 UTC), BillingAlertFunction (hourly)
│   │       └── Middleware/                # AuthMiddleware, CorrelationIdMiddleware, ExceptionHandler
│   └── tests/
│       ├── Domain.Tests/                  # Unit tests — entities and value objects
│       ├── Application.Tests/             # Unit tests — use cases with mocked repositories
│       └── Integration.Tests/             # Full-stack tests — real SQL (TestContainers)
│
└── frontend/
    ├── src/
    │   ├── app/                           # Next.js App Router
    │   │   ├── (auth)/                    # /login — Azure AD sign-in via NextAuth
    │   │   ├── (claimant)/                # /claims, /claims/new, /claims/[id]
    │   │   ├── (approvals)/               # /approvals — HOD / MD swipeable queue
    │   │   ├── (finance)/                 # /finance — receipt gate + billing tags
    │   │   └── (dashboard)/               # /dashboard — MIS, fraud, billing recovery
    │   ├── components/
    │   │   ├── claims/                    # ClaimWizard (4-step), LineItemRow, ReceiptCapture
    │   │   ├── approvals/                 # ApprovalCard, SwipeableQueue
    │   │   ├── finance/                   # PhysicalReceiptForm, BillingTagSelector
    │   │   └── ui/                        # StatusBadge, TrafficLightCard, AlertBanner, Tooltip
    │   ├── lib/
    │   │   ├── api/                       # Typed API client (generated from OpenAPI spec)
    │   │   └── auth/                      # NextAuth config (Azure AD), session helpers
    │   └── hooks/                         # useDraft, useClaimStatus, useApprovalQueue
    └── tests/
        ├── unit/                          # Jest + React Testing Library
        └── e2e/                           # Playwright — full user journey tests

```

**Structure Decision**: Web application layout (Option 2). Backend is Azure Functions isolated worker — same clean architecture layering as a traditional .NET Web API but deployed serverless. All domain and application logic is in plain C# class libraries with no Azure dependencies, making them fully unit-testable without any cloud infrastructure.

## Complexity Tracking

No constitution violations. No complexity justification required.
