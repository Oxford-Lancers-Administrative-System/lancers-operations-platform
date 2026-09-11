import { PageHeader } from "@/components/page-header";
import Stack from "@mui/material/Stack";
import { gateShellPage } from "../../gate";
import { GUIDE_SUBTITLE, GUIDE_TITLE } from "./content";
import GuideFaq from "./guide-faq";

// How administration works — LAN-134. Gated on role_management (relocations.md).
export default async function AdministrationGuidePage() {
  const gate = await gateShellPage("/operate/admin/guide", "role_management");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <PageHeader title={GUIDE_TITLE} subtitle={GUIDE_SUBTITLE} />

      <GuideFaq />
    </Stack>
  );
}
