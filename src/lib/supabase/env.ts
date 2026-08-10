/**
 * Supabase environment resolution.
 *
 * Supabase is mid-migration between two key naming schemes:
 *
 *   legacy  — `anon` (browser-safe JWT)        / `service_role` (privileged JWT)
 *   current — `publishable` (`sb_publishable_…`) / `secret` (`sb_secret_…`)
 *
 * Both are accepted here so the same code works against a local stack and a
 * hosted project regardless of which scheme that project issues. See
 * docs/adr/0003-supabase-key-types.md.
 *
 * Hard rule: only `NEXT_PUBLIC_*` values may reach the browser bundle. The
 * secret / service_role key is server-only, must never be imported from a
 * Client Component, and must never be present on a development machine
 * pointed at production.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it from \`npm run db:status\`.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Browser-safe key. Subject to RLS. Safe to ship in a client bundle. */
export function getSupabasePublishableKey(): string {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)", value);
}

/**
 * Privileged key. Bypasses RLS. Server-only.
 *
 * Never call this from code that can be bundled for the browser. It is used
 * only by administrative scripts and, if a future ticket needs it, by trusted
 * Cloud Run backend code reading the value from Secret Manager at runtime.
 */
export function getSupabaseSecretKey(): string {
  const value = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return required("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)", value);
}
