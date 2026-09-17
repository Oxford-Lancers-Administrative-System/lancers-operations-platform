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
      <PolicySection title="Who the request goes to">
        <Typography>
          The <strong>University of Oxford</strong> is the data controller. Oxford University
          Lancers American Football Club administers the platform on its behalf, and the General
          Manager handles requests.
        </Typography>
      </PolicySection>
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
          A request has to come from a contact address or number already on your record, or be
          verified with an officer in person — so that somebody else cannot ask for your records to
          be deleted. The club has one month to respond.
        </Typography>
        <Typography>
          Deletion means anonymisation. Your name, contact details, date of birth and the other
          facts that identify you are removed and cannot be recovered. What the club did — the
          attendance, the responses, the agreements — stays, pointing at a record with no name on
          it, because that is the club’s record of its own seasons rather than a record about you.
          Two club officers have to approve it before anything happens.
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
