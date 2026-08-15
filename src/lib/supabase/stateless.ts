import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

/**
 * A Supabase client that keeps nothing: no cookie, no session, no PKCE state.
 *
 * `createClient` in `./server.ts` is the right client for everything that acts
 * as a signed-in user. This one exists for the single request that must **not**
 * leave a trace in the browser — starting password recovery.
 *
 * `@supabase/ssr` hard-codes `flowType: "pkce"` after spreading caller options,
 * so a client built there always writes a code-verifier cookie when it starts a
 * recovery, and the emailed link then only works in the browser that asked for
 * it. Operators request a reset on one device and open the email on another;
 * that flow has to survive it. Requesting through this client leaves Supabase
 * with no PKCE flow state, so the recovery email carries a one-time token hash
 * any device can present. See `src/lib/auth/recovery.ts` for the whole shape.
 *
 * Publishable key only, so it is still an anonymous, RLS-bound caller — this is
 * not a privileged path and must never become one.
 */
export function createStatelessClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });
}
