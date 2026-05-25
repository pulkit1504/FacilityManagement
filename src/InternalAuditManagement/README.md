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

## Secrets

Production secrets should live in Azure Key Vault. Set `AZURE_KEY_VAULT_URL` and grant the running app identity `Key Vault Secrets User` access.

Expected Key Vault secret names:

```text
Supabase--Url
Supabase--ServiceRoleKey
AzureStorage--ConnectionString
AzureStorage--ContainerName
```

For Vercel, configure `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` as encrypted environment variables so `DefaultAzureCredential` can read Key Vault. For Azure hosting later, use Managed Identity instead.

## Architecture Rule

API route handlers are intentionally thin. Business rules live under `src/server/services`, database access under `src/server/repositories`, and cloud file storage under `src/server/storage`.
