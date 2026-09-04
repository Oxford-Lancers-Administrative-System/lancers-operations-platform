import { redirect } from "next/navigation";

/**
 * The root is the sign-in page. Audit finding B8, taken as a delta on Brian's
 * decision at the 4 September 2026 visual review (LAN-225).
 *
 * What stood here was LAN-71's bootstrap scaffold: a heading, a paragraph
 * describing the repository as an "infrastructure scaffold" whose "only job is
 * to prove the development, CI, and deployment loop", and buttons to
 * `/dashboard` and `/login`. It was written to prove the deploy loop worked and
 * was never replaced. Nobody arriving at the club's operations platform should
 * be told about the CI pipeline, and there is nothing else for a signed-out
 * visitor to do here.
 *
 * A redirect rather than a second copy of the form: `/login` stays the one
 * canonical sign-in route that the proxy, the recovery emails and the route
 * contract in `docs/ux/slice-ux.md` all name, and `redirectTo` keeps working
 * from exactly one place. Signing in from here lands on `/operate`, which is
 * the login page's own default destination.
 */
export default function Home() {
  redirect("/login");
}
