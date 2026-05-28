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

Production login uses app-managed email and password authentication. Users can sign in with any email address as long as it matches an active `employees.email` record with a password set by an Admin user.

Configure these Vercel environment variables:

```text
APP_AUTH_MODE=credentials
AUTH_SESSION_SECRET=<at least 32 random characters>
AUTH_BOOTSTRAP_EMAIL=admin@example.com
AUTH_BOOTSTRAP_PASSWORD=<temporary first-admin password>
```

The application role comes from the employee row. `AUTH_BOOTSTRAP_EMAIL` and `AUTH_BOOTSTRAP_PASSWORD` are optional first-run credentials for an active employee without a saved password; remove them after using Admin setup to assign real passwords. Local test-user login is only enabled when `APP_AUTH_MODE=test`.

## Architecture Rule

API route handlers are intentionally thin. Business rules live under `src/server/services`, database access under `src/server/repositories`, and cloud file storage under `src/server/storage`.
