import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";

import ConsentControl from "@/app/operate/recruitment/[prospectId]/consent-control";
import { consentStatusLabel } from "@/lib/services/recruitment-vocabulary";
import type { RecruitConsentSummary } from "@/lib/services/recruitment-prospect";

/**
 * "Messaging" — LAN-371, and only for a recruit.
 *
 * Brian, 2026-09-16: an operator can withdraw a recruit's messaging consent,
 * and the record shows granted or revoked. The same two controls the recruit's
 * own record carries, on the record an operator is more likely to be looking
 * at when somebody asks them to stop.
 *
 * A roster player never sees this: `readRecruitConsentForPerson` returns null
 * for them, because consent and Stop are recruit concepts (LAN-372) and a
 * player asking the club to stop messaging them is a membership conversation.
 */
export function MessagingSection({
  consent,
  displayName,
  mayChange = true,
}: {
  consent: RecruitConsentSummary;
  displayName: string;
  /** LAN-432 — consent is a Recruit details write; without `edit` there the control is absent. */
  mayChange?: boolean;
}) {
  return (
    <Section variant="banded" band="person" title="Messaging">
      <Fact label={`WhatsApp consent · ${consent.seasonLabel}`}>
        {consentStatusLabel(consent.state, {
          byOperator: consent.byOperator,
          changedAt: consent.changedAt,
        })}
      </Fact>
      {mayChange ? (
        <Fact label="Action">
          <ConsentControl
            prospectId={consent.prospectId}
            displayName={displayName}
            granted={consent.state === "granted"}
          />
        </Fact>
      ) : null}
    </Section>
  );
}
