"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabasePublishableKey, getSupabaseUrl } from "./env";
import { SUPABASE_COOKIE_OPTIONS } from "./cookies";

/** Browser Supabase client. Publishable key only — always subject to RLS. */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
  });
}
