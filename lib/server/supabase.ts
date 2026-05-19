import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getOptionalEnv } from "@/lib/server/env";

export function getSupabaseAdmin() {
  const url = getOptionalEnv("SUPABASE_URL");
  const serviceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return undefined;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
