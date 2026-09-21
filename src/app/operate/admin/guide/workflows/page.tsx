import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { gateShellPage } from "../../../gate";
import {
  ADMINISTRATION_GUIDE_LINK,
  PLAYBOOK_PAGES,
  PLAYBOOK_SUBTITLE,
  PLAYBOOK_TITLE,
} from "../_playbook/content";

/**
 * The playbook's index — LAN-399, `operator_guide`.
 *
 * It lives one segment below `/operate/admin/guide` rather than at it: that
 * address is the existing How administration works page, which Brian's decision
 * of 21 September 2026 keeps exactly as it is, on its own `role_management`
 * gate. So the index links to it instead of absorbing it, and the eight
 * workflow pages sit beside it at `/operate/admin/guide/<slug>`.
 *
 * The gate is the narrow capability, not `role_management`. Nothing here is
 * dangerous to read; the audience is a decided one, and the decision is
 * recorded on the capability's own entry.
 */
export default async function PlaybookIndexPage() {
  const gate = await gateShellPage("/operate/admin/guide/workflows", "operator_guide");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <PageHeader title={PLAYBOOK_TITLE} subtitle={PLAYBOOK_SUBTITLE} />

      <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
        {PLAYBOOK_PAGES.map((page) => (
          <li key={page.slug}>
            <Section title={page.name} testId={`playbook-index-${page.slug}`}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {page.summary}
              </Typography>
              <Link href={`/operate/admin/guide/${page.slug}`}>{`Open ${page.name}`}</Link>
            </Section>
          </li>
        ))}
      </Stack>

      <Section title={ADMINISTRATION_GUIDE_LINK.label} testId="playbook-index-administration">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {ADMINISTRATION_GUIDE_LINK.summary}
        </Typography>
        <Link href={ADMINISTRATION_GUIDE_LINK.href}>
          {`Open ${ADMINISTRATION_GUIDE_LINK.label}`}
        </Link>
      </Section>
    </Stack>
  );
}
