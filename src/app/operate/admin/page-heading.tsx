import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { PageHeader } from "@/components/page-header";

// The heading every Administration page opens with — LAN-133: title + guide
// link, one context line, actions top-right.
export default function AdminPageHeading({
  title,
  subtitle,
  help = false,
  actions,
  back,
}: {
  title: string;
  subtitle: string;
  help?: boolean;
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

/** Inline SVG, not `@mui/icons-material`, for one 16px mark — a dependency change out of proportion. */
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
