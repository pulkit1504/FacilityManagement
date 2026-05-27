# Internal Audit Management

Production-oriented MVP for a Facility Management expense-control system.

## Stack

- Next.js full-stack app on Vercel
- Supabase PostgreSQL for relational data
- Azure Blob Storage for receipts and vouchers
- Service/repository backend structure so the API layer can move to ASP.NET Core later

## Local Setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Apply the SQL in `db/001_initial_schema.sql` to Supabase before testing real persistence.
Apply later files in numeric order, for example `db/003_add_admin_role.sql`, when upgrading an existing database.

## Secrets

Production secrets should live in Azure Key Vault. Set `AZURE_KEY_VAULT_URL` and grant the running app identity `Key Vault Secrets User` access.

Expected Key Vault secret names:

```text
Supabase-Url
Supabase-ServiceRoleKey
fmsstorage-connectionstring
```

Receipt files are stored in the `nimbus` container in storage account `fmsstorage15`.

For Vercel, configure `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` as encrypted environment variables so `DefaultAzureCredential` can read Key Vault. For Azure hosting later, use Managed Identity instead.

## Authentication

Production login uses Microsoft Entra ID. Configure these Vercel environment variables:

```text
APP_AUTH_MODE=entra
AUTH_SESSION_SECRET=<at least 32 random characters>
ENTRA_TENANT_ID=<directory tenant id>
ENTRA_CLIENT_ID=<app registration client id>
ENTRA_CLIENT_SECRET=<app registration client secret>
ENTRA_REDIRECT_URI=https://<your-domain>/api/v1/auth/callback
```

The Entra app registration must include the same redirect URI. Signed-in users are matched to active `employees.email` records; their application role comes from the employee row. Local test-user login is only enabled when `APP_AUTH_MODE=test`.

## Architecture Rule

API route handlers are intentionally thin. Business rules live under `src/server/services`, database access under `src/server/repositories`, and cloud file storage under `src/server/storage`.
