import { PageHeader } from "@/components/page-header";
import Stack from "@mui/material/Stack";
import { gateShellPage } from "../../gate";
import { GUIDE_SUBTITLE, GUIDE_TITLE } from "./content";
import GuideFaq from "./guide-faq";

/**
 * `/operate/admin/guide` — **How administration works**. LAN-134,
 * `REQ-club-operating-guide` and `DEC-in-app-administration-guide`.
 *
 * ## It is protected, and by the same thing everything else here is
 *
 * `REQ-club-operating-guide` calls it "a protected in-app guide", and this page
 * is gated on `role_management` exactly as Operators and Roles are — through
 * `gateShellPage`, which resolves the operator from the verified session and
 * renders the approved refusal rather than an `if` written here.
 *
 * That is worth one sentence of justification, because a page of prose is the
 * kind of thing somebody leaves open "since it says nothing sensitive". It does
 * say something sensitive: it is a complete description of who may act on whom,
 * where the club's last administrative path is, and which seat cannot be
 * touched from inside the application. That is a map of the authorization model
 * handed to whoever asks. `role_management` is the same three seats that may
 * use every action the guide describes, so the guide is readable by exactly the
 * people it is for.
 *
 * The gate also means the reader is already inside the operator shell, which is
 * why the page opens with a heading and no navigation of its own.
 *
 * The shared heading presents the title and context without another help link.
 *
 * ## No callout, here or anywhere else
 *
 * `REQ-club-operating-guide` forbids callouts, and the prototype's README
 * repeats it. The whole design is that Operators and Roles carry a quiet
 * question-mark link and this page carries the explanation — so there is no
 * banner on this page either, and adding one to any Administration screen later
 * would be reversing a recorded decision rather than improving a screen.
 */
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
