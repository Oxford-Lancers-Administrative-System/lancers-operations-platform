import type { Metadata } from "next";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { publicPageMetadata } from "@/lib/brand";
import { PolicyHeading, PolicySection, PrivacyContact } from "../policy-content";

export const metadata: Metadata = publicPageMetadata(
  "Privacy notice",
  "How Oxford Lancers uses personal information in its operations platform and how to contact the club about your data.",
);

export default function PrivacyPage() {
  return (
    <>
      <PolicyHeading
        title="Privacy notice"
        intro="This notice covers personal information used in the Oxford Lancers operations platform, including club administration and messages sent through WhatsApp or email."
      />
      <PolicySection title="Who is responsible">
        <Typography>
          Oxford University Lancers American Football Club is the data controller for the club
          information it holds in this platform. The General Manager is the club’s privacy contact.
        </Typography>
        <PrivacyContact />
      </PolicySection>
      <PolicySection title="Information the platform holds">
        <Typography>
          Depending on your involvement with the club, records may include your name, contact
          details including your university email address, university and membership information,
          your student number, your BAFA registration number, date of birth, emergency contact
          details, recruitment answers, onboarding progress and agreement records.
        </Typography>
        <Typography>
          The platform also records event invitations, your responses and answers, attendance,
          availability status, messaging preferences, message delivery results, account access and a
          history of administrative changes.
        </Typography>
        <Typography>
          Your student number and, for coaching and sideline personnel, your BAFA registration
          number are printed on the roster form the club hands to the match officials at a game.
          That form is produced from these records at the time it is needed and is not stored.
        </Typography>
        <Typography>
          Information comes from you, authorised club officers and existing club records, including
          returning-player records. An emergency contact’s details are supplied by the person who
          names them.
        </Typography>
      </PolicySection>
      <PolicySection title="How the club uses information">
        <Typography>
          The club uses these records to administer membership and recruitment, complete onboarding,
          organise events, collect responses, record attendance, follow up outstanding tasks and
          manage access to club systems.
        </Typography>
        <Typography>
          Messages may include invitations, changes, cancellations and reminders. Delivery records
          help the club identify messages that did not reach their recipient. Scheduled reminders
          are automated; authorised club officers handle follow-up and corrections.
        </Typography>
      </PolicySection>
      <PolicySection title="Who can access information">
        <Typography>
          Club officers and coaches receive access according to their responsibilities. Access to
          dates of birth and emergency contacts is restricted. Public event pages do not publish the
          membership register or individual responses.
        </Typography>
        <Typography>
          The platform uses Google Cloud and Supabase for hosting, storage and account services,
          Meta’s WhatsApp Business Platform for WhatsApp delivery, and email delivery services for
          email. These services receive the information needed to provide their part of the service.
        </Typography>
      </PolicySection>
      <PolicySection title="Your choices and requests">
        <Typography>
          You can ask the General Manager about the information held about you, request access or
          correction, and request deletion or restriction where applicable. You may also have a
          right to receive a portable copy of information you supplied.
        </Typography>
        <Typography>
          Where processing relies on consent, you can withdraw that consent. You can use the Stop
          messages link where provided or contact the General Manager about messaging preferences.
          Withdrawing consent does not affect processing that was lawful before withdrawal.
        </Typography>
        <Typography>
          <strong>Right to object:</strong> you can object to processing based on legitimate
          interests and to use of your information for direct marketing.
        </Typography>
        <Typography>
          See <Link href="/data-deletion">how to request data deletion</Link> for the information to
          include in a request.
        </Typography>
      </PolicySection>
      <PolicySection title="Questions and complaints">
        <PrivacyContact />
        <Typography>
          You can also raise a concern with the UK Information Commissioner’s Office at{" "}
          <Link href="https://ico.org.uk/make-a-complaint/">ico.org.uk/make-a-complaint</Link>.
        </Typography>
      </PolicySection>
    </>
  );
}
