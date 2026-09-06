import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { PageHeader } from "@/components/page-header";

/**
 * The heading every Administration page opens with — LAN-133.
 *
 * Three things in a fixed arrangement, because all three are decided rather
 * than chosen:
 *
 *   * the page title, and beside it, on the same line, the **compact
 *     question-mark link** to the guide;
 *   * one line of context under it — the operating year, and a count where the
 *     page has one;
 *   * the actions, top right, primary first.
 *
 * `DEC-administration-navigation` and `REQ-admin-surfaces` are unusually
 * specific about the help link: it is "reached from a compact question-mark How
 * Administration Works link beside the page heading, **not a callout or another
 * sidebar destination**", and the prototype's own README repeats it and adds
 * "There are no in-application callouts". Writing it as a shared component is
 * how the two pages that carry it cannot drift into two different treatments —
 * and how a third page cannot quietly grow a banner.
 *
 * The guide page itself is `WP-guide`'s. This is the link to it.
 */
export default function AdminPageHeading({
  title,
  subtitle,
  help = false,
  actions,
  back,
}: {
  title: string;
  /** The operating year, a count, or what the page is. Never a sentence of help. */
  subtitle: string;
  /** Whether this page carries the guide link. Operators and Roles do. */
  help?: boolean;
  /** Top-right, primary first. */
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <PageHeader
      title={title}
      subtitle={<span data-testid="admin-page-subtitle">{subtitle}</span>}
      status={help ? <HowAdministrationWorksLink /> : undefined}
      actions={actions}
      back={back}
    />
  );
}

/** The words, so a test asserts the approved label rather than a variable. */
export const HOW_ADMINISTRATION_WORKS = "How administration works";

/**
 * The link itself: a small circled question mark and four quiet words.
 *
 * The glyph is inline SVG rather than an icon package. `@mui/icons-material` is
 * not a dependency of this repository, and adding one for a single 16-pixel
 * mark would be a dependency change — reviewable, deployable, and out of
 * proportion to the drawing. It is `aria-hidden` and carries no meaning the
 * text does not: a reader who never sees it still reads the whole link.
 */
function HowAdministrationWorksLink() {
  return (
    <Link
      href="/operate/admin/guide"
      variant="body2"
      underline="hover"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}
    >
      <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        sx={{ width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 2 }}
      >
        <circle cx="12" cy="12" r="9" />
        <path
          d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 17h.01" strokeLinecap="round" />
      </Box>
      {HOW_ADMINISTRATION_WORKS}
    </Link>
  );
}
