import "server-only";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { timeAsync } from "../observability/performance";

type SecretName =
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "AZURE_STORAGE_CONNECTION_STRING"
  | "RESEND_API_KEY"
  | "NOTIFICATION_FROM_EMAIL";

const keyVaultNameMap: Record<SecretName, string> = {
  SUPABASE_URL: "Supabase-Url",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase-ServiceRoleKey",
  AZURE_STORAGE_CONNECTION_STRING: "fmsstorage-connectionstring",
  RESEND_API_KEY: "Resend-ApiKey",
  NOTIFICATION_FROM_EMAIL: "Notification-FromEmail"
};

const cache = new Map<SecretName, Promise<string>>();
let keyVaultClient: SecretClient | null = null;

export async function getRequiredSecret(name: SecretName): Promise<string> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  const secretPromise = resolveSecret(name);
  cache.set(name, secretPromise);
  return secretPromise;
}

export async function getOptionalSecret(name: SecretName): Promise<string | null> {
  try {
    return await getRequiredSecret(name);
  } catch {
    return null;
  }
}

async function resolveSecret(name: SecretName): Promise<string> {
  const keyVaultUrl = process.env.AZURE_KEY_VAULT_URL;

  if (keyVaultUrl) {
    const secret = await timeAsync(
      "keyVault.getSecret",
      () => getKeyVaultClient(keyVaultUrl).getSecret(keyVaultNameMap[name]),
      { secretName: keyVaultNameMap[name] }
    );
    if (secret.value) {
      return secret.value;
    }
  }

  const fallback = process.env[name];
  if (fallback) {
    return fallback;
  }

  throw new Error(`${name} is not configured in Azure Key Vault or environment variables.`);
}

function getKeyVaultClient(keyVaultUrl: string) {
  if (!keyVaultClient) {
    keyVaultClient = new SecretClient(keyVaultUrl, new DefaultAzureCredential());
  }

  return keyVaultClient;
}
