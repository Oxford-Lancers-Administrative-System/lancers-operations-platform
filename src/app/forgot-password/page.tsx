import type { Metadata } from "next";
import AuthShell from "../auth-shell";
import { safeRelativeDestination } from "@/lib/auth/destination";
import ForgotPasswordForm from "./forgot-password-form";

/**
 * `/forgot-password` — LAN-125.
 *
 * Public, and it says nothing. Everything that decides whether an email is sent
 * happens in the server action; this page's whole responsibility is to ask for
 * one address and to keep the sign-in destination the operator arrived with.
 *
 * `robots: noindex` and the `no-store` headers `src/proxy.ts` sets on this path
 * are belt and braces: this page holds no secret today, and the reset page it
 * leads to does.
 */
export const metadata: Metadata = {
  title: "Reset your password — Lancers Operations",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const redirectTo = safeRelativeDestination(params.redirectTo);
  const signInHref = `/login?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthShell
      heading="Reset your password"
      intro="Enter the email address connected to your operator profile and the club will send you a link to choose a new password."
    >
      <ForgotPasswordForm signInHref={signInHref} />
    </AuthShell>
  );
}
