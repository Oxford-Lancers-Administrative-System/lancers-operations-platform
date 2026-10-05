import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/page-header";
import { gateShellPage } from "../../../gate";
import { PLAYBOOK_TITLE } from "../_playbook/content";
import { COMPLIANCE_SECTIONS, COMPLIANCE_TITLE } from "../content";
import { GuideSections } from "../guide-faq";

/**
 * Compliance and user protections — LAN-467.
 *
 * Its own guide page since Brian's visual review of 5 October 2026, with the
 * text it had as the last section of How administration works. A static
 * segment, so Next resolves it before the playbook's `[slug]`. The page shell
 * is the workflow pages' own (Guide eyebrow, title, back to the guide). The
 * gate is `role_management`, the audience the text already had on How
 * administration works.
 */
export default async function ComplianceGuidePage() {
  const gate = await gateShellPage("/operate/admin/guide/compliance", "role_management");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <PageHeader
        eyebrow={PLAYBOOK_TITLE}
        title={COMPLIANCE_TITLE}
        back={{ href: "/operate/admin/guide/workflows", label: "Back to the guide" }}
      />

      <GuideSections entries={COMPLIANCE_SECTIONS} />
    </Stack>
  );
}
