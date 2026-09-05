import RosterPage from "@/app/operate/roster/page";

/**
 * S1 — the roster board on the club's tokens. LAN-225.
 *
 * The board is deliberately outside the kit (brief §2: "It only takes the
 * tokens"). This route renders the real `/operate/roster` page component,
 * unchanged, inside the proposed shell: what differs from `main` is the theme
 * and the three band colours `board-columns.ts` now reads from the kit.
 */
export default async function RosterPreviewPage({
  searchParams,
}: PageProps<"/design-preview/roster">) {
  return <RosterPage params={Promise.resolve({})} searchParams={searchParams} />;
}
