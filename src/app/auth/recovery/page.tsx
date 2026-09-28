import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  isPlausibleRecoveryTokenHash,
  RECOVERY_CONFIRM_LABEL,
  RECOVERY_EXCHANGE_PATH,
  RECOVERY_LINK_TYPE,
  RESET_PASSWORD_PATH,
} from "@/lib/auth/recovery";
import { EmailLinkButton, singleQueryValue } from "../email-link-button";

/**
 * `/auth/recovery` — where the password-reset email lands. LAN-125, LAN-441.
 *
 * A GET exchanges nothing and contacts nothing: no Supabase client is created
 * on this page, by design, so an email security scanner that pre-opens the link
 * leaves the one-time token unspent. The button posts to `./exchange/route.ts`,
 * which performs the exchange under every rule that route records.
 *
 * A link that is not a recovery-shaped token goes to `/reset-password` exactly
 * as a failed exchange does: no recovery session, one generic screen, nothing in
 * the query string.
 */
export const metadata: Metadata = {
  title: "Reset your password — Lancers Operations",
  robots: { index: false, follow: false },
};

export default async function RecoveryPage({ searchParams }: PageProps<"/auth/recovery">) {
  const query = await searchParams;
  const tokenHash = singleQueryValue(query.token_hash);
  const type = singleQueryValue(query.type);

  if (type !== RECOVERY_LINK_TYPE || !isPlausibleRecoveryTokenHash(tokenHash)) {
    redirect(RESET_PASSWORD_PATH);
  }

  return (
    <EmailLinkButton
      label={RECOVERY_CONFIRM_LABEL}
      exchangePath={RECOVERY_EXCHANGE_PATH}
      tokenHash={tokenHash}
      type={type}
      testId="recovery-confirm"
    />
  );
}
