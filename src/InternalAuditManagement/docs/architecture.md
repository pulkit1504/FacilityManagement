# Architecture

The MVP is a Next.js full-stack app, but the backend is structured as if it will become an ASP.NET Core API later.

## Runtime Now

```text
Browser
  -> Vercel Next.js pages
  -> Next.js API routes
  -> TypeScript services
  -> Repository interfaces
  -> Supabase PostgreSQL
  -> Azure Blob Storage
```

## Migration Later

```text
Browser
  -> Next.js frontend
  -> ASP.NET Core controllers
  -> C# application services
  -> C# repositories
  -> same PostgreSQL schema
  -> same Azure Blob containers
```

## Rules

- React components never contain approval, billing, finance, or audit rules.
- API routes validate input and call one service method.
- Services own workflow decisions and audit side effects.
- Repositories own persistence details.
- File storage is accessed through a storage service abstraction.
- PostgreSQL migrations are the source of truth for schema changes.
- Sensitive values are loaded through `src/server/config/secrets.ts`, which reads Azure Key Vault first and falls back to local environment variables only for development.

## Secret Management

Production deployments must store these secrets in Azure Key Vault:

```text
Supabase--Url
Supabase--ServiceRoleKey
fmsstorage-connectionstring
```

The receipt Blob container is hardcoded as `nimbus` because it is environment-specific operational configuration for the current deployment.

The application uses `DefaultAzureCredential`. On Vercel, this requires `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` environment variables for the Key Vault reader app registration. When moved to Azure App Service or Container Apps, replace that bootstrap credential with Managed Identity and remove the client secret from hosting configuration.
