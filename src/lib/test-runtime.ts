/**
 * Production implementations of the LAN-222 test seams.
 *
 * This module reads no environment, file or network configuration and cannot
 * enable a test control. Only `next dev` may substitute the local apparatus
 * implementation, through the development-only rule in next.config.ts.
 */
import "server-only";
import type { EnvironmentSource } from "./delivery/config";
import type { Transport } from "./delivery/provider";
export function testTransport(source: EnvironmentSource): Transport | null {
  void source;
  return null;
}
export function testSource(source: EnvironmentSource): EnvironmentSource {
  return source;
}
export function applicationNow(): Date {
  return new Date();
}
export function applicationSql(sql: string): string {
  return sql;
}

/** Per-transaction initialization is inert in production. */
export async function testTransaction(client: {
  query(sql: string, values?: unknown[]): Promise<unknown>;
}): Promise<void> {
  void client;
}

/** Recipient restrictions remain enforced outside the local test apparatus. */
export function testRecipientsUnrestricted(): boolean {
  return false;
}
