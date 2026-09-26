import { looksLikeEmailAddress } from "@/lib/auth/recovery";

/**
 * The recorded email a seat's invitation would use, or `null` when the form
 * must ask for a Login email — LAN-434. The same test the service applies in
 * `planSeatAccountIn`, so the panel never shows an address the service would
 * then refuse. Pure; read by the role page (server) and its panels (client).
 */
export function usableRecordedEmail(email: string | null): string | null {
  if (email === null) return null;
  const trimmed = email.trim();
  return looksLikeEmailAddress(trimmed.toLowerCase()) ? trimmed : null;
}
