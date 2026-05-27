import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequiredSecret } from "../config/secrets";
import { timeAsync } from "../observability/performance";

let client: SupabaseClient | null = null;

export async function getSupabaseAdminClient() {
  if (client) {
    return client;
  }

  client = await timeAsync("supabase.client.create", async () => {
    const [url, key] = await Promise.all([
      getRequiredSecret("SUPABASE_URL"),
      getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY")
    ]);

    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  });

  return client;
}
