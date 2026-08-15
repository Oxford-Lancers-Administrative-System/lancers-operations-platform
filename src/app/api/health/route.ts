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
 *
 * `databaseConfigured` does the same for the service layer's PostgreSQL
 * credential, and is deliberately just as coarse. It answers "does this revision
 * have a DATABASE_URL at all" and nothing else: not the host, not the port, not
 * the connection mode, not the role, not whether a connection succeeds. The
 * deploy gate reads it so a revision that would fail on its first transaction
 * fails at deploy time instead — see docs/deployment.md.
 *
 * It stays presence-only for the reason the whole endpoint is dependency-free:
 * probing the database here would turn a database blip into an outage, and
 * reporting *why* a connection failed would publish the target to anyone who
 * can curl the service.
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
    databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    timestamp: new Date().toISOString(),
  });
}
