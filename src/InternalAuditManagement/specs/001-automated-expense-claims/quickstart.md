# Quickstart: Automated Expense Claims — Get Running in 15 Minutes

**Branch**: `001-automated-expense-claims`
**Last updated**: 2026-05-25

This guide gets a developer from zero to a running local environment. Every step is a copy-paste command.

---

## What You Need First (Prerequisites)

Install these once. If you have them, skip ahead.

| Tool | Version | Where to get it | Why needed |
|------|---------|-----------------|------------|
| .NET SDK | 9.0+ | https://dot.net | Backend runtime |
| Node.js | 22 LTS | https://nodejs.org | Frontend runtime |
| Azure Functions Core Tools | v4 | `npm install -g azure-functions-core-tools@4 --unsafe-perm true` | Run functions locally |
| Azure CLI | Latest | https://docs.microsoft.com/cli/azure/install | Authenticate to Azure for local dev |
| Docker Desktop | Latest | https://docker.com | TestContainers for integration tests |
| Git | Latest | https://git-scm.com | Source control |

---

## Step 1 — Clone and Navigate

```powershell
git clone https://github.com/pulkit1504/FacilityManagement.git
cd FacilityManagement/src/InternalAuditManagement
```

---

## Step 2 — Backend: Copy Environment Settings

```powershell
cd backend
Copy-Item src/Functions/local.settings.json.example src/Functions/local.settings.json
```

Open `src/Functions/local.settings.json` and fill in the values:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "SqlConnectionString": "Server=localhost,1433;Database=ExpenseClaims_Dev;User Id=sa;Password=YourStrong!Passw0rd;TrustServerCertificate=True",
    "AzureAd__TenantId": "<your-azure-ad-tenant-id>",
    "AzureAd__ClientId": "<your-azure-ad-app-client-id>",
    "BlobStorageConnection": "UseDevelopmentStorage=true",
    "ApplicationInsights__ConnectionString": "",
    "ErpBaseUrl": "https://erp-mock.yourdomain.com",
    "AcsEmailConnectionString": "",
    "BillingTeamEmail": "billing@yourdomain.com",
    "FinanceHodEmail": "finance-hod@yourdomain.com"
  }
}
```

> **Note**: `UseDevelopmentStorage=true` uses Azurite (local Azure Storage emulator). No Azure account needed for local development.

---

## Step 3 — Start the Local SQL Server (Docker)

```powershell
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourStrong!Passw0rd" `
  -p 1433:1433 --name sql_dev -d `
  mcr.microsoft.com/mssql/server:2022-latest
```

Wait 10 seconds for SQL to start, then apply migrations:

```powershell
cd backend/src/Infrastructure
dotnet tool install --global dotnet-ef   # skip if already installed
dotnet ef database update --project . --startup-project ../Functions
```

This creates all tables including the append-only `AuditLog` with the correct `DENY UPDATE, DELETE` grants.

---

## Step 4 — Start Azurite (Local Blob Storage)

```powershell
npm install -g azurite
Start-Process azurite --passthru   # runs in background
```

Or use the VS Code Azurite extension (recommended — starts automatically).

---

## Step 5 — Run the Backend

```powershell
cd backend/src/Functions
func start
```

The backend starts at `http://localhost:7071`. You should see:

```
Azure Functions Core Tools
Core Tools Version: 4.x.x
Functions:
  ClaimsFunction: [GET,POST] http://localhost:7071/api/v1/claims
  ApprovalsFunction: [GET,POST] http://localhost:7071/api/v1/approvals/queue
  HealthFunction: [GET] http://localhost:7071/api/v1/health
  ...
```

**Quick smoke test**:
```powershell
Invoke-RestMethod http://localhost:7071/api/v1/health
# Expected: { "status": "Healthy", "version": "1.0.0", ... }
```

---

## Step 6 — Seed Test Data

```powershell
cd backend
dotnet run --project src/Functions -- seed
```

This creates:
- 5 test employees (1 Claimant, 1 HOD, 1 MD, 1 Finance user, 1 BillingTeam user)
- 2 test sites (Ansal Heights Block A, Sunrise Gardens)
- 1 test client contract
- 5 holidays (national holidays 2026)
- 3 sample claims in various statuses (Draft, Submitted, PaymentReleased)

---

## Step 7 — Frontend: Install and Run

```powershell
cd ../../frontend
npm install
Copy-Item .env.local.example .env.local
```

Open `.env.local` and fill in:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=any-random-string-for-local-dev

AZURE_AD_CLIENT_ID=<your-azure-ad-app-client-id>
AZURE_AD_CLIENT_SECRET=<your-azure-ad-app-client-secret>
AZURE_AD_TENANT_ID=<your-azure-ad-tenant-id>

NEXT_PUBLIC_API_BASE_URL=http://localhost:7071
```

Start the frontend:

```powershell
npm run dev
```

Open http://localhost:3000. Log in with a seeded test account.

---

## Step 8 — Run Tests

### Backend unit tests (fast, no Docker needed):
```powershell
cd backend
dotnet test tests/Domain.Tests tests/Application.Tests --verbosity normal
```

### Backend integration tests (requires Docker — spins up a real SQL instance):
```powershell
dotnet test tests/Integration.Tests --verbosity normal
```

### Frontend unit tests:
```powershell
cd frontend
npm test
```

### E2E tests (requires both backend and frontend running):
```powershell
npx playwright install   # first time only
npx playwright test
```

---

## Local Azure AD Setup (One-Time, 5 Minutes)

If you don't have Azure AD configured yet:

1. Go to https://portal.azure.com → Entra ID → App Registrations → New Registration
2. Name: `ExpenseClaims-Dev`
3. Redirect URI: `http://localhost:3000/api/auth/callback/azure-ad`
4. After creation: note the `Client ID` and `Tenant ID`
5. Certificates & Secrets → New client secret → note the secret value
6. App Roles → Add roles: `Claimant`, `HOD`, `MD`, `Finance`, `BillingTeam`, `FinanceHOD`
7. Users → assign yourself one of the roles

That's it. Paste the values into `local.settings.json` and `.env.local`.

---

## Project Scripts Reference

| Command | What it does |
|---------|-------------|
| `func start` (in `backend/src/Functions`) | Start the Azure Functions backend |
| `dotnet test` (in `backend`) | Run all backend tests |
| `npm run dev` (in `frontend`) | Start Next.js dev server |
| `npm test` (in `frontend`) | Run frontend unit tests |
| `npx playwright test` (in `frontend`) | Run E2E tests |
| `dotnet ef migrations add <Name>` | Create a new EF Core migration |
| `dotnet ef database update` | Apply pending migrations |
| `azurite` | Start local blob/queue storage emulator |

---

## Troubleshooting

**"Cannot connect to SQL Server"** — Make sure the Docker container is running: `docker ps | Select-String sql_dev`

**"401 Unauthorized on all API calls"** — Azure AD token is missing or expired. Re-login via the frontend, then copy the Bearer token from browser DevTools → Network → any request → Authorization header.

**"Blob upload fails"** — Make sure Azurite is running: `azurite --version` should respond. If using the VS Code extension, check the Azurite status bar item.

**"Proforma submission blocked"** — You need at least 2 line items on a Proforma claim. This is intentional (FR-002).

**"Payment release blocked"** — Physical receipt confirmation is required first (FR-009). Go to Finance → Confirm Physical Receipt before releasing payment.
