import { NextResponse } from "next/server";

import { getPool } from "@/lib/db";

/**
 * Deploy-readiness endpoint for Cloud Run releases and uptime checks.
 *
 * This is a deploy-readiness check, not a Cloud Run liveness probe. When a
 * database is configured it reads one row from a current-schema table, so a
 * revision cannot report healthy against a database that is missing the schema
 * it was built to use.
 *
 * `secretsLoaded` reports only whether the runtime secret injected from Secret
 * Manager is present — never its value, length, or prefix. It exists so a deploy
 * can be verified without anyone reading a secret.
 *
 * `databaseConfigured` does the same for the service layer's PostgreSQL
 * credential. `schemaCompatible` reports only whether the current-schema probe
 * succeeded. Neither field reports a host, role, credential detail, or failure
 * reason.
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
      // This endpoint is public. Report the failed capability, never the target
      // or the database error that explains it.
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
