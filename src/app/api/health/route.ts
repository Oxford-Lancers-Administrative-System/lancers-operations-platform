import { NextResponse } from "next/server";

import { getPool } from "@/lib/db";

/**
 * Deploy-readiness endpoint for Cloud Run releases and uptime checks, not a
 * liveness probe. Reads one row from a current-schema table when a database
 * is configured. `secretsLoaded`/`databaseConfigured`/`schemaCompatible`
 * report presence only — never a value, host, role, or failure reason.
 */
export const dynamic = "force-dynamic";

/**
 * How long one probe's answer stands. This is the one unauthenticated route
 * that touches the database, and the pool behind it is five connections per
 * instance (LAN-352). Ten seconds is still fresh for a deploy gate or an
 * uptime check, and it means a burst of requests costs one query, not one
 * connection each.
 */
export const PROBE_TTL_MS = 10_000;

let probe: { readonly at: number; readonly compatible: boolean } | null = null;

/** Test seam. Never called by the application. */
export function resetHealthProbe(): void {
  probe = null;
}

async function schemaIsCompatible(now: number): Promise<boolean> {
  if (probe !== null && now - probe.at < PROBE_TTL_MS) return probe.compatible;
  let compatible = false;
  try {
    await getPool().query("select id from public.events limit 1");
    compatible = true;
  } catch {
    // Public endpoint: report the failed capability, never the error that explains it.
  }
  probe = { at: now, compatible };
  return compatible;
}

export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const schemaCompatible = databaseConfigured ? await schemaIsCompatible(Date.now()) : false;

  const status = databaseConfigured && !schemaCompatible ? "error" : "ok";

  return NextResponse.json(
    {
      status,
      service: "lancers-operations-platform",
      revision: process.env.K_REVISION ?? "local",
      commit: process.env.GIT_COMMIT_SHA ?? "unknown",
      secretsLoaded: Boolean(
        process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      databaseConfigured,
      schemaCompatible,
      timestamp: new Date().toISOString(),
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
