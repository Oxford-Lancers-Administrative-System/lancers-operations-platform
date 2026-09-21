import { notFound } from "next/navigation";
import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/page-header";
import { gateShellPage } from "../../../gate";
import { CapabilityTable } from "../_playbook/capability-table";
import { PLAYBOOK_PAGES, PLAYBOOK_TITLE, playbookPage } from "../_playbook/content";
import { PlaybookView } from "../_playbook/playbook-view";

/**
 * One workflow page — LAN-399, `operator_guide`.
 *
 * A dynamic segment beside the static `workflows` one. Next resolves a static
 * segment first, so `/operate/admin/guide/workflows` is the index and never a
 * slug; every other segment is looked up in the playbook and `notFound()` if it
 * is not one of the eight. The gate runs **before** the lookup, so an
 * unauthorised reader cannot tell a real workflow from a typo.
 */
export function generateStaticParams() {
  return PLAYBOOK_PAGES.map((page) => ({ slug: page.slug }));
}

export default async function PlaybookWorkflowPage({
  params,
}: PageProps<"/operate/admin/guide/[slug]">) {
  const { slug } = await params;
  const gate = await gateShellPage(`/operate/admin/guide/${slug}`, "operator_guide");
  if ("screen" in gate) return gate.screen;

  const page = playbookPage(slug);
  if (!page) notFound();

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <PageHeader
        eyebrow={PLAYBOOK_TITLE}
        title={page.name}
        subtitle={page.summary}
        back={{ href: "/operate/admin/guide/workflows", label: "Back to the guide" }}
      />

      <PlaybookView
        page={page}
        capabilities={page.slug === "operators-and-roles" ? <CapabilityTable /> : undefined}
      />
    </Stack>
  );
}
