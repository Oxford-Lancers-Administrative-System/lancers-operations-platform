import RosterPage from "@/app/operate/roster/page";

/** S1 — the roster board on the club's tokens (LAN-225). Renders the real `/operate/roster` page unchanged, inside the proposed shell. */
export default async function RosterPreviewPage({
  searchParams,
}: PageProps<"/design-preview/roster">) {
  return <RosterPage params={Promise.resolve({})} searchParams={searchParams} />;
}
