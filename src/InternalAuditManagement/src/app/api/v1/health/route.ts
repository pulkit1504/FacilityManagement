import { NextResponse } from "next/server";
import { warmCoreSecrets } from "@/server/config/secrets";

export async function GET() {
  if (process.env.AZURE_KEY_VAULT_URL || process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await warmCoreSecrets();
  }

  return NextResponse.json({
    status: "Healthy",
    version: "0.1.0",
    timestamp: new Date().toISOString()
  });
}
