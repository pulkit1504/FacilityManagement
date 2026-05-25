import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequiredSecret } from "../config/secrets";

let client: SupabaseClient | null = null;

export async function getSupabaseAdminClient() {
  if (client) {
    return client;
  }

  const [url, key] = await Promise.all([
    getRequiredSecret("SUPABASE_URL"),
    getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY")
  ]);

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return client;
}
