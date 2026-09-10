import type { Metadata } from "next";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { publicPageMetadata } from "@/lib/brand";
import { PolicyHeading, PolicySection, PrivacyContact } from "../policy-content";

export const metadata: Metadata = publicPageMetadata(
  "Request data deletion",
  "How to ask Oxford Lancers to delete personal information held in its operations platform.",
);

export default function DataDeletionPage() {
  return (
    <>
      <PolicyHeading
        title="Request data deletion"
        intro="You can ask the club to delete personal information held about you in the Oxford Lancers operations platform. You do not need to sign in to make a request."
      />
      <PolicySection title="Contact the General Manager">
        <PrivacyContact />
        <Typography>
          Use the subject “Data deletion request”. Include your name, the email address or phone
          number you use with the club, and whether you want all of your information or particular
          records considered for deletion.
        </Typography>
        <Typography>
          Do not send passwords, sign-in links, identity documents or medical details with your
          initial request.
        </Typography>
      </PolicySection>
      <PolicySection title="What happens next">
        <Typography>
          The General Manager will coordinate the request with the people who administer the
          platform. The club may need to confirm your identity before acting, so that somebody else
          cannot request deletion of your records.
        </Typography>
        <Typography>
          Deletion rights depend on the circumstances. The club will explain what can be deleted and
          the reason for any information that must be retained, rather than promising that every
          record can be removed immediately.
        </Typography>
      </PolicySection>
      <PolicySection title="Messages and other services">
        <Typography>
          Stopping messages and deleting your club records are separate requests. Use a Stop
          messages link where provided, or ask the General Manager to update your messaging
          preferences.
        </Typography>
        <Typography>
          Deleting a club record does not delete copies of messages already on a recipient’s phone
          or close your WhatsApp account. Requests about information held independently by another
          service need to be directed to that service.
        </Typography>
        <Typography>
          For more about the information the platform holds, read the{" "}
          <Link href="/privacy">privacy notice</Link>.
        </Typography>
      </PolicySection>
    </>
  );
}
