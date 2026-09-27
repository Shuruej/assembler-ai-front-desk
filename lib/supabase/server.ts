import { createClient } from "@supabase/supabase-js";
import { fetch as undiciFetch } from "undici";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

export function createSupabaseServiceRoleClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      global: {
        fetch: undiciFetch as unknown as typeof fetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
