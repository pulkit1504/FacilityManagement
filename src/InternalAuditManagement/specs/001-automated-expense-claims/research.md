# Research: Automated Expense Claims Mechanism

**Phase 0 output** | Branch: `001-automated-expense-claims` | Date: 2026-05-25

All technology decisions below resolve unknowns from the Technical Context in `plan.md`. Each decision records what was chosen, why it was chosen, and which alternatives were evaluated and rejected.

---

## Decision 1: Backend Runtime — Azure Functions v4 (.NET 9, Isolated Worker)

**Decision**: Azure Functions v4 with .NET 9 Isolated Worker process model.

**Rationale**:
- The Consumption Plan gives **1 million free executions per month** and **400,000 GB-s free compute** — more than sufficient for 10–50 claims/day.
- Serverless auto-scales on demand and costs literally ₹0 at idle (nights, weekends). A traditional App Service or Container App would cost ₹400–800/month minimum even if unused.
- Timer-triggered functions for nightly fraud sweeps and billing alert loops require zero additional infrastructure — they run on the same consumption plan.
- The Isolated Worker model provides full .NET 9 support with proper DI, middleware pipeline, and clean startup — suitable for clean architecture layering.

**Alternatives considered**:
- *Azure App Service (F1 free tier)*: Rejected — 60 CPU minutes/day limit is insufficient; no always-on; shared infrastructure with noisy neighbours.
- *Azure Container Apps*: Rejected — minimum billing of ~₹400/month even at low scale; overkill for this traffic volume.
- *Node.js Azure Functions*: Rejected — team familiarity and EF Core ecosystem strongly favour C# for this domain.

---

## Decision 2: Frontend Framework — Next.js 15 on Vercel

**Decision**: Next.js 15 (App Router) deployed on Vercel Hobby plan (free).

**Rationale**:
- **Vercel Hobby is permanently free** for personal/small-team projects: 100 GB bandwidth, unlimited deployments, automatic HTTPS, global CDN, preview deployments per branch.
- Next.js App Router provides Server Components for initial page load performance (important for mobile on 4G) and Client Components for interactive claim wizard forms.
- Built-in image optimisation for receipt photo thumbnails.
- NextAuth.js integrates seamlessly with Azure Entra ID for SSO authentication.
- Tailwind CSS 4 provides a mobile-first responsive design system with zero runtime cost.

**Alternatives considered**:
- *React + Vite on GitHub Pages*: Rejected — no server-side rendering means slower mobile initial load; no built-in auth support; less seamless Azure AD integration.
- *Angular*: Rejected — heavier bundle size; less appropriate for mobile-first; team preference.
- *Flutter Web*: Rejected — immature for complex form workflows; no Azure AD integration; large bundle size.

---

## Decision 3: Database — Azure SQL Database Serverless

**Decision**: Azure SQL Database Serverless (General Purpose, 0.5–2 vCores, 32 GB).

**Rationale**:
- Azure SQL has a **free offer**: 32 GB storage, 100,000 vCore-seconds/month — sufficient for a company with 50 claims/day for the first 12 months.
- Serverless tier **auto-pauses** after 1 hour of inactivity (configurable), billing ₹0 at idle. At 50 claims/day the database is idle most of the day.
- Full SQL Server compatibility means EF Core migrations, parameterised queries, `ROWVERSION` optimistic concurrency, `DENY DELETE, UPDATE` on audit log tables — all constitution requirements met natively.
- Azure SQL has built-in TDE (Transparent Data Encryption) for data at rest — no additional configuration required.

**Alternatives considered**:
- *PostgreSQL on Azure (Flexible Server)*: Rejected — free tier limited to 12 months then ~₹800/month minimum; auto-pause not available on free tier.
- *Supabase (hosted PostgreSQL)*: Rejected — 500 MB storage limit on free tier is too small once receipts hash metadata accumulates; data sovereignty concerns for Indian regulatory compliance.
- *Cosmos DB (serverless)*: Rejected — NoSQL does not fit the relational audit log and org-chart hierarchy requirements; query complexity for fraud analytics would be much higher.

---

## Decision 4: Receipt File Storage — Azure Blob Storage LRS

**Decision**: Azure Blob Storage (Locally Redundant Storage, Hot tier).

**Rationale**:
- **5 GB free for 12 months**, then ~₹1.5/GB/month LRS. At an average receipt of 500 KB with 50 claims/day × 2 line items = 50 MB/day → ~1.5 GB/month. The free tier covers the first 3–4 months; thereafter ~₹50–75/month.
- AES-256 encryption at rest is **built-in and automatic** — no configuration required. Fulfils FR-015.
- Azure Blob native ETag (MD5 hash) is used as the file integrity hash for tamper detection. Combined with our own SHA-256 hash stored in the database, any file substitution is detectable.
- Shared Access Signatures (SAS tokens) with 15-minute expiry used for secure download links — never exposing permanent public URLs.

**Alternatives considered**:
- *Cloudinary (free tier)*: Rejected — 25 GB bandwidth limit is low; image transformations are unnecessary overhead; less secure for financial documents.
- *AWS S3*: Rejected — unnecessary cross-cloud dependency; Azure Blob integrates natively with Azure Functions and Key Vault.

---

## Decision 5: Authentication & RBAC — Azure Entra ID (Free Tier)

**Decision**: Azure Entra ID (formerly Azure AD) Free tier with Azure AD App Registration.

**Rationale**:
- **50,000 Monthly Active Users free** — far exceeds a 20–100 person FM company.
- Issues JWT Bearer tokens validated by `Microsoft.Identity.Web` on the backend.
- Role claims (`Claimant`, `HOD`, `MD`, `Finance`, `BillingTeam`, `FinanceHOD`) are assigned to employees in Azure AD app roles and returned in the token — no custom role database required.
- NextAuth.js (frontend) uses the Azure AD provider for seamless SSO — employees use their work Microsoft 365 account (if the company uses M365) or dedicated Azure AD credentials.
- MFA and Conditional Access policies can be enforced at the Azure AD level with zero backend code changes.

**RBAC Role Matrix**:

| Role | Claims | Others' Claims | Approve | Finance Actions | Audit Log | Dashboard |
|------|--------|----------------|---------|-----------------|-----------|-----------|
| Claimant | Own only | ✗ | ✗ | ✗ | Own only | ✗ |
| HOD | Own + direct reports | Direct reports only | HOD approve | ✗ | Read-only | HOD view |
| MD | Own + all HOD claims | All HOD claims | MD approve | ✗ | Read-only | Full |
| Finance | Read all | Read all | ✗ | All finance actions | Read-only | Full |
| BillingTeam | Read billable | Read billable | ✗ | Link invoices | Read-only | Billing only |
| FinanceHOD | Read all | Read all | ✗ | All + override | Read-only | Full + escalations |

**Alternatives considered**:
- *Azure AD B2C*: Rejected — B2C is for external/customer-facing apps; B2B (Entra ID) is correct for internal employees.
- *Auth0 (free tier)*: Rejected — 7,500 MAU limit; no native Azure RBAC integration; additional vendor dependency.
- *Custom JWT*: Rejected — rolling your own auth is an OWASP security risk; violates Constitution Principle I.

---

## Decision 6: Email Notifications — Azure Communication Services Email

**Decision**: Azure Communication Services (ACS) Email with a custom domain.

**Rationale**:
- **100 emails/day free** indefinitely. At 48-hour alert cycles for pending billing items, a company with 50 claims/day will generate at most 20–30 alert emails/day — comfortably within the free tier.
- Native Azure service integrates directly with Azure Functions via `Azure.Communication.Email` SDK — no third-party credentials to manage.
- Supports custom domain (e.g., noreply@expensemanager.yourcompany.com) for professional appearance.

**Alternatives considered**:
- *SendGrid (Twilio)*: 100 emails/day free tier is the same but requires a separate vendor account and API key management.
- *SMTP via Microsoft 365*: Rejected — requires a licensed M365 mailbox; not all FM companies will have M365.

---

## Decision 7: Observability — Azure Application Insights (Free 5 GB/month)

**Decision**: Serilog with `Serilog.Sinks.ApplicationInsights` sink + Azure Application Insights.

**Rationale**:
- **5 GB structured log data free per month** — sufficient for this scale indefinitely.
- Application Insights provides: distributed tracing (W3C Trace Context — Constitution Principle V), live request metrics, failure rate dashboards, and custom metrics for business KPIs.
- Serilog's structured logging (`{@claim}` → property bags not string concatenation) satisfies Constitution Principle V — all log entries are JSON with `correlationId`, `userId`, `requestPath`, `durationMs`.
- Sampling can be configured to stay under 5 GB/month at higher traffic.

---

## Decision 8: Retry & Resilience Library — Polly 8

**Decision**: `Polly` v8 with `Microsoft.Extensions.Http.Resilience` integration.

**Rationale**:
- Polly 8 introduces `ResiliencePipeline` — a clean fluent API for combining retry, circuit breaker, timeout, and hedging strategies.
- `Microsoft.Extensions.Http.Resilience` adds Polly policies to `HttpClient` via DI — the ERP invoice validation client gets retry + circuit breaker with 3 lines of configuration.
- Handles the spec's requirement: ERP unavailable at submission time → accept with "Pending ERP Validation" flag → async revalidation job.

---

## Decision 9: Form Validation — React Hook Form + Zod

**Decision**: `react-hook-form` v7 with `zod` schema validation.

**Rationale**:
- React Hook Form uses uncontrolled components — minimal re-renders on every keystroke, critical for mobile performance on the 4-step claim wizard.
- Zod schemas are defined once and shared between client-side validation and (via type generation) OpenAPI contract validation — a single source of truth for form shapes.
- `zod-form-data` enables validation of multipart form submissions (receipt uploads).
- Auto-save draft logic hooks naturally into `useForm`'s `watch()` + `useDebounce()`.

---

## Decision 10: Secrets Management — Azure Key Vault

**Decision**: Azure Key Vault (Standard tier, first 10,000 operations/month free).

**Rationale**:
- All connection strings, ERP API keys, and ACS credentials stored in Key Vault — never in source code or environment variable files committed to git.
- Azure Functions identity (Managed Identity) fetches secrets at startup via `Azure.Extensions.AspNetCore.Configuration.Secrets` — no credentials needed in deployment pipeline.
- Secrets can be rotated without redeployment.
- Standard tier: first 10,000 secret operations/month free; thereafter ~₹0.003/operation. This workload will stay within the free tier.

---

## Summary: All NEEDS CLARIFICATION Items Resolved

| Item | Resolution |
|------|-----------|
| Testing framework (backend) | xUnit + Moq + FluentAssertions + TestContainers |
| Testing framework (frontend) | Jest + React Testing Library + Playwright |
| Frontend state management | TanStack Query (server state) + React Hook Form (form state) |
| Time abstraction for tests | Custom `ISystemClock` interface injected into all domain services |
| PDF generation for reports | Out of scope for Phase 1 — MIS is a web dashboard, not exported PDFs |
| Multi-currency support | Out of scope — INR only |
| ERP offline handling | "Pending ERP Validation" flag + async Polly retry on timer trigger |
| Holiday calendar | Configurable `Holiday` table in DB, seeded at deployment |
