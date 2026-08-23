import { headers } from "next/headers";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  allowPublicLinkRequest,
  clientKeyFrom,
  logThrottledClubLinkRequest,
} from "@/lib/rsvp/public-surface";
import { labelFor, STATUS_LABELS } from "@/lib/services/event-vocabulary";
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
 * REQ-no-joining-url.
 *
 * **What actually holds that, corrected (R157-B5).** Not the compiler. This
 * file used to claim the boundary was "enforced by the compiler rather than by
 * this file remembering", and it is not: adding `delivery: person.delivery` to
 * the club-link literal in `@/lib/services/participation` passes `tsc` and the
 * whole unit project, because TypeScript's excess-property check is a
 * freshness rule on object literals and freshness is lost through `.map()`.
 * What holds the boundary is the **separate per-tier query** — the club-link
 * query does not select delivery at all — and the **field-by-field
 * reassembly** of each visible row. What proves it is
 * `src/lib/services/participation.test.ts`'s payload assertions, which are the
 * only thing in the repository that catches the widened literal.
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
 * Unknown, revoked, a token whose event went back to draft, and a throttled
 * request all render the same panel. `./club-link.ts` keeps the first three
 * distinct internally for logs and tests and the limiter logs the fourth; a
 * stranger learns which one they are holding from nothing here.
 *
 * ## Rate limited, and why it had to be — R157-B4
 *
 * Every request here is a **write**: `resolveClubLinkIn` stamps `use_count` and
 * `last_used_at`, and the read behind it is a full outer join plus a question
 * scan, with `force-dynamic` and `no-store` so nothing caches. One link
 * forwarded past the squad is therefore unbounded write load against the single
 * production database and unbounded Cloud Run instance time — and with no
 * revocation shipped, the only remedy would be rotating `CLUB_LINK_SECRET`,
 * which kills every club link for every event.
 *
 * The counter is `/rsvp`'s, extended rather than rewritten, with its own
 * per-link allowance: one club link serves a whole squad at once, so the RSVP
 * per-player number would throttle the ordinary case. It is counted before the
 * token is resolved, so a scanner cannot spend database round trips.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClubLinkPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const requestHeaders = await headers();
  const decision = allowPublicLinkRequest("club_link", clientKeyFrom(requestHeaders), token);
  if (!decision.allowed) {
    logThrottledClubLinkRequest(decision.reason!);
  }

  const page = decision.allowed
    ? await readClubLinkParticipation(token)
    : ({ state: "unavailable" } as const);

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
  // W157-F1. The one thing on this page that can send somebody to the wrong
  // place. Every reader here holds no account and has no other surface: a
  // squad member forwarded the link for a cancelled session read a mandatory
  // practice with thirty-one people saying yes, and would turn up to a locked
  // pitch. Said whenever the status is not `approved` — `draft` cannot reach
  // this page at all, so today that is `cancelled` and only `cancelled`.
  //
  // The **reason** is deliberately absent, and structurally so: `ClubLinkEvent`
  // has no `decisionReason` key. Whether a private cancellation reason is
  // club-link-tier is a separate disclosure question and is not answered here.
  const notApproved = participation.event.status !== "approved";
  const cancelled = participation.event.status === "cancelled";
  const basePath = `/e/${encodeURIComponent(token)}`;
  const filters = readParticipationFilters(query, participation.questions, participation.tier);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            {CLUB_LINK_BRAND}
          </Typography>
          {/*
            The struck-through name and the warning chip are the public event
            page's treatment of a cancelled event, reused rather than reinvented
            — `docs/ux/standards.md` rule 7, and the public page is the tier
            whose reader is closest to this one. The subtitle then carries the
            status word first, exactly as the operator's own subtitle does.
          */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography
              variant="h6"
              component="h1"
              sx={{ textDecoration: cancelled ? "line-through" : "none" }}
            >
              {participation.event.name}
            </Typography>
            {notApproved ? (
              <Chip
                color="warning"
                size="small"
                label={labelFor(STATUS_LABELS, participation.event.status)}
                data-testid="club-link-status"
              />
            ) : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {[
              notApproved ? labelFor(STATUS_LABELS, participation.event.status) : null,
              formatEventWhen(participation.event),
              CLUB_LINK_SUBTITLE,
            ]
              .filter(Boolean)
              .join(" · ")}
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
