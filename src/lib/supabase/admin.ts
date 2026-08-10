import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseSecretKey, getSupabaseUrl } from "./env";

/**
 * Privileged Supabase client. **Bypasses RLS.**
 *
 * The `server-only` import makes importing this from a Client Component a build
 * error. Nothing in the current scaffold uses it at request time — it exists so
 * the privileged path is defined once, correctly, rather than improvised later.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
