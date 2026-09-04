import type { Metadata } from "next";
import { safeRelativeDestination } from "@/lib/auth/destination";
import SignInScreen from "./login/sign-in-screen";

/**
 * The root is where a visitor signs in. Audit finding B8, taken on Brian's
 * decision at the 4 September 2026 visual review (LAN-225).
 *
 * What stood here was LAN-71's bootstrap scaffold: a heading, a paragraph
 * describing the repository as an "infrastructure scaffold" whose "only job is
 * to prove the development, CI, and deployment loop", and buttons to
 * `/dashboard` and `/login`. It was written to prove the deploy loop worked and
 * was never replaced. Nobody arriving at the club's operations platform should
 * be told about the CI pipeline, and a signed-out visitor has nothing else to
 * do here.
 *
 * It renders the sign-in screen rather than redirecting to `/login`. Both are
 * the same component, so there is one screen and not two, and `/login` stays
 * the route the proxy redirects to with `?redirectTo=`, the one the recovery
 * emails link to, and the one the route contract names.
 */
export const metadata: Metadata = {
  title: "Sign in — Lancers Operations",
  robots: { index: false, follow: false },
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  return (
    <SignInScreen
      redirectTo={safeRelativeDestination(params.redirectTo)}
      justReset={params.reset === "1"}
    />
  );
}
