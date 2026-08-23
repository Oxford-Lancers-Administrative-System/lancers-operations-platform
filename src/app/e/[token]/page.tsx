import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { readParticipationFilters } from "@/lib/services/participation-view";
import { readClubLinkParticipation } from "@/lib/services/participation";

import { EventFacts, formatEventWhen, HeadlineNumbers } from "../../participation/event-facts";
import { ParticipationFilterBar } from "../../participation/participation-filters";
import { ParticipationTable } from "../../participation/participation-table";
import {
  CLUB_LINK_BRAND,
  CLUB_LINK_SUBTITLE,
  CLUB_LINK_UNAVAILABLE_DETAIL,
  CLUB_LINK_UNAVAILABLE_HEADLINE,
} from "../../participation/presentation";

/**
 * The club link — W7-03. D2, D81, LAN-157.
 *
 * ## Why this route exists
 *
 * Coaches hold no operator account. Without this they cannot see who is coming
 * to their own session. Brian, 2026-08-21: "The event ID shared with anyone
 * should be openable by anyone … Here's the list of everyone here."
 *
 * ## What holds it shut
 *
 * The **token**, resolved in the service layer, and nothing else. There is no
 * session here, no sign-in prompt and no `/operate` navigation — a link to the
 * operator shell would invite a coach to a surface they have no account for.
 *
 * `readClubLinkParticipation` is the only way into this data from here, and the
 * type it returns has no delivery field and no joining URL, so neither can
 * reach the page or the payload behind it. That is REQ-club-link and
 * REQ-no-joining-url, enforced by the compiler rather than by this file
 * remembering.
 *
 * ## Not privacy-blocking, and still not cached
 *
 * D81 settles that a squad list is not a secret from the squad. It does not
 * make the page a public document: `src/proxy.ts` gives this prefix the same
 * three headers the RSVP page gets — `no-store`, `no-referrer`, `noindex` — for
 * the same three reasons. The token is in the URL, the page names people, and
 * an indexed squad list would outlive the link.
 *
 * ## One body for every refusal
 *
 * Unknown, revoked, and a token whose event went back to draft all render the
 * same panel. `./club-link.ts` keeps them distinct internally for logs and
 * tests; a stranger learns which one they are holding from nothing here.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClubLinkPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const page = await readClubLinkParticipation(token);

  if (page.state !== "live") {
    return (
      <Box sx={{ maxWidth: 640, mx: "auto", p: 3 }}>
        <Paper variant="outlined" sx={{ p: 3 }} data-testid="club-link-unavailable">
          <Typography variant="h6" component="h1">
            {CLUB_LINK_UNAVAILABLE_HEADLINE}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {CLUB_LINK_UNAVAILABLE_DETAIL}
          </Typography>
        </Paper>
      </Box>
    );
  }

  const { participation } = page;
  const basePath = `/e/${encodeURIComponent(token)}`;
  const filters = readParticipationFilters(query, participation.questions);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            {CLUB_LINK_BRAND}
          </Typography>
          <Typography variant="h6" component="h1">
            {participation.event.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatEventWhen(participation.event)} · {CLUB_LINK_SUBTITLE}
          </Typography>
        </Box>

        <EventFacts event={participation.event} />
        <HeadlineNumbers headline={participation.headline} />
        <ParticipationFilterBar basePath={basePath} filters={filters} showDelivery={false} />
        <ParticipationTable basePath={basePath} participation={participation} filters={filters} />
      </Stack>
    </Box>
  );
}
