import type { Metadata } from "next";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { publicPageMetadata } from "@/lib/brand";
import { PolicyHeading, PolicySection, PrivacyContact } from "../policy-content";

export const metadata: Metadata = publicPageMetadata(
  "Terms of use",
  "Using the Oxford Lancers operations platform, accounts and private links.",
);

export default function TermsPage() {
  return (
    <>
      <PolicyHeading
        title="Terms of use"
        intro="The Oxford Lancers operations platform supports the club’s membership, onboarding, events and communications."
      />
      <PolicySection title="Accounts and private links">
        <Typography>
          Use only the account or private link provided for you. Keep passwords and personal links
          private. Access to another person’s information depends on the permissions assigned by the
          club.
        </Typography>
        <Typography>
          If you receive a link intended for somebody else or think your access has been
          compromised, contact the club and do not use that access.
        </Typography>
      </PolicySection>
      <PolicySection title="Keeping records accurate">
        <Typography>
          Provide accurate information and update it when it changes. Where you cannot correct a
          record yourself, ask the General Manager. Only change another person’s record when your
          club responsibilities and access permit it.
        </Typography>
      </PolicySection>
      <PolicySection title="Club arrangements">
        <Typography>
          The platform records club arrangements; it does not replace the club’s Code of Conduct,
          participation requirements or separately presented agreements. Contact the club if an
          event detail or record appears incorrect.
        </Typography>
      </PolicySection>
      <PolicySection title="Privacy and contact">
        <Typography>
          The <Link href="/privacy">privacy notice</Link> explains how the platform uses personal
          information. You can also <Link href="/data-deletion">request data deletion</Link>.
        </Typography>
        <PrivacyContact />
      </PolicySection>
    </>
  );
}
