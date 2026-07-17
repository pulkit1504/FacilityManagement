# GA Environment Runbook

Use this runbook before investor demos or GA validation against the shared Supabase data.

## Azure account

The Key Vault used by the expense app is:

```powershell
$env:AZURE_KEY_VAULT_URL = "https://fm-expense-kv.vault.azure.net/"
```

Sign in with the tenant that owns the vault:

```powershell
az login --tenant b9fbe672-2200-47da-a67d-09193903c423 --use-device-code --allow-no-subscriptions
az account set --subscription 4e10764a-d524-4492-bb90-94038585336e
az keyvault secret show --vault-name fm-expense-kv --name Supabase-Url --query "{name:name,enabled:attributes.enabled}" -o json
```

Expected account:

- User: `guptapulkit1504@outlook.com`
- Tenant: `b9fbe672-2200-47da-a67d-09193903c423`
- Subscription: `4e10764a-d524-4492-bb90-94038585336e`

The application runtime does not read Azure by subscription ID. It reads Key Vault by `AZURE_KEY_VAULT_URL`, then reads the Blob Storage connection string from the `fmsstorage-connectionstring` Key Vault secret. When Key Vault or Storage is moved to another subscription, update RBAC and secrets in that subscription rather than changing application code:

- Grant the Vercel service principal `Key Vault Secrets User` on the moved vault.
- Keep `AZURE_KEY_VAULT_URL` pointed at the active vault URL, for example `https://fm-expense-kv.vault.azure.net/`.
- Update the `fmsstorage-connectionstring` secret if the Storage account connection string changed.
- Redeploy Vercel after environment variable, RBAC, or secret changes.

## Environment variables

For local GA testing, use Azure CLI credentials and unset inherited service-principal/certificate variables that may point to another tenant:

```powershell
Remove-Item Env:AZURE_CLIENT_ID -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_CLIENT_SECRET -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_CLIENT_CERTIFICATE_PATH -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_TENANT_ID -ErrorAction SilentlyContinue

$env:AZURE_TOKEN_CREDENTIALS = "AzureCliCredential"
$env:AZURE_SUBSCRIPTION_ID = "4e10764a-d524-4492-bb90-94038585336e"
$env:AZURE_KEY_VAULT_URL = "https://fm-expense-kv.vault.azure.net/"
$env:APP_AUTH_MODE = "test"
$env:AUTH_SESSION_SECRET = "playwright-test-session-secret-at-least-32-characters"
$env:NOTIFICATION_TEST_RECIPIENT = "playwright@example.com"
```

## Warm-up

Start the app and call health once before the first page load. The health endpoint warms the Supabase URL and service-role key from Key Vault when Key Vault or Supabase env configuration is present.

```powershell
npm run dev -- --port 3020
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3020/api/v1/health
```

## Investor demo seed

Run the seed before demos to ensure the key flows have data:

```powershell
npm run seed:investor-demo
```

The seed creates or refreshes:

- One returned claim for claimant correction.
- One finance release-ready claim.
- One open audit exception with evidence.
- One open billing alert.

The script uses fixed demo IDs and only deletes/replaces those demo records.
