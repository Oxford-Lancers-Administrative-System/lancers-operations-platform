import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/page-header";
import { RowCard, RowCardList } from "@/components/row-card";
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

      <RowCardList at="all" component="ul">
        {PLAYBOOK_PAGES.map((page) => (
          <li key={page.slug}>
            <RowCard
              testId={`playbook-index-${page.slug}`}
              title={
                <Link href={`/operate/admin/guide/${page.slug}`} underline="hover">
                  {page.name}
                </Link>
              }
              sublines={[page.summary]}
            />
          </li>
        ))}
      </RowCardList>

      <RowCard
        testId="playbook-index-administration"
        title={
          <Link href={ADMINISTRATION_GUIDE_LINK.href} underline="hover">
            {ADMINISTRATION_GUIDE_LINK.label}
          </Link>
        }
        sublines={[ADMINISTRATION_GUIDE_LINK.summary]}
      />
    </Stack>
  );
}
