import type { Metadata } from "next";
import AuthShell from "../auth-shell";
import { safeRelativeDestination } from "@/lib/auth/destination";
import ForgotPasswordForm from "./forgot-password-form";

/** `/forgot-password` — LAN-125. Public, says nothing; the server action decides whether an email is sent. `robots: noindex` and `no-store` are belt and braces. */
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
