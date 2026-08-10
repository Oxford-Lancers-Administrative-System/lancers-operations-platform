import { NextResponse } from "next/server";

/**
 * Liveness/readiness endpoint for Cloud Run and uptime checks.
 *
 * Deliberately dependency-free: it must not touch Supabase. A health check that
 * fails when the database is briefly unavailable causes Cloud Run to recycle
 * healthy instances and turns a database blip into an outage.
 *
 * `secretsLoaded` reports only whether the runtime secret injected from Secret
 * Manager is present — never its value, length, or prefix. It exists so a deploy
 * can be verified without anyone reading a secret.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "lancers-operations-platform",
    revision: process.env.K_REVISION ?? "local",
    commit: process.env.GIT_COMMIT_SHA ?? "unknown",
    secretsLoaded: Boolean(
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    timestamp: new Date().toISOString(),
  });
}
