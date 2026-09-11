import { NextResponse } from "next/server";

import { getPool } from "@/lib/db";

/**
 * Deploy-readiness endpoint for Cloud Run releases and uptime checks, not a
 * liveness probe. Reads one row from a current-schema table when a database
 * is configured. `secretsLoaded`/`databaseConfigured`/`schemaCompatible`
 * report presence only — never a value, host, role, or failure reason.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  let schemaCompatible = false;

  if (databaseConfigured) {
    try {
      await getPool().query("select id from public.events limit 1");
      schemaCompatible = true;
    } catch {
      // Public endpoint: report the failed capability, never the error that explains it.
    }
  }

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
