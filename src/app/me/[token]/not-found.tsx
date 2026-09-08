import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/**
 * One response for every unresolvable durable link. LAN-172.
 *
 * An unknown token, a revoked one, and one whose season has closed all render
 * here identically — `resolvePersonTokenIn` already collapses the three to
 * `unknown` before this file is ever reached, so there is no state here to
 * keep separate. Same reasoning as `src/app/a/[token]/not-found.tsx` and
 * `src/app/rsvp/[token]/not-found.tsx`.
 */
export default function PlayerHomeUnusable() {
  return (
    <PublicShell>
      <PageHeader title={"This link can’t be used"} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        Request the latest message from the club for a current link to your page.
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
        For privacy, we can’t provide more information about this link.
      </Typography>
    </PublicShell>
  );
}
