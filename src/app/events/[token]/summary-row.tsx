/**
 * One invitation's summary card — title, sublines, the state sentence, the
 * status chip and its row actions. Split from `page.tsx` (LAN-300).
 */
import Link from "@mui/material/Link";
import { Fact, FactGrid } from "@/components/fact";
import { RowCard } from "@/components/row-card";
import { StatusChip } from "@/components/status-chip";

import { DESCRIPTION_LABEL, EQUIPMENT_LABEL } from "@/lib/services/event-vocabulary";
import { needsFollowUp, type PlayerHomeInvitation } from "@/lib/services/player-home";

import {
  AWAITING_ANSWER_CHIP,
  attendingSentence,
  formatDeadline,
  formatEventDate,
  formatEventTime,
  FOLLOW_UP_NO_REASON_SENTENCE,
  FOLLOW_UP_QUESTIONS_SENTENCE,
  NEXT_CHIP,
  NO_REASON_GIVEN,
  STANDING_NO,
  STANDING_YES,
  STILL_NEED_ANSWER_SENTENCE,
  answeredSentence,
} from "./presentation";
import { openHref, RowActions } from "./row-actions";

export function when(entry: PlayerHomeInvitation): string | null {
  const date = formatEventDate(entry.scheduledOn);
  const time = formatEventTime(entry.startsAt, entry.endsAt);
  return [date, time].filter(Boolean).join(" · ") || null;
}

/** The row's own one-line state sentence — Q-23's "what the copy says". */
function rowSentence(entry: PlayerHomeInvitation): string | null {
  if (entry.standingAnswer === null) {
    // Already followed up once separates "Still need your answer" from "New invitations", so it leads.
    if (entry.reminderSent) return STILL_NEED_ANSWER_SENTENCE;
    const deadline = formatDeadline(entry.responseDeadline);
    const proof = attendingSentence(entry.attendingCount);
    const bits = [proof, deadline ? `Answer by ${deadline}` : null].filter(Boolean);
    return bits.length > 0 ? bits.join(" · ") : null;
  }
  if (needsFollowUp(entry)) {
    return entry.standingAnswer === "no" && entry.reasonIsDefault
      ? FOLLOW_UP_NO_REASON_SENTENCE
      : FOLLOW_UP_QUESTIONS_SENTENCE;
  }
  return answeredSentence(entry.standingAnswer, entry.reason);
}

/**
 * What the club said about this event, on the card — LAN-323.
 *
 * Clint, on this page: "EVENTS DO NOT SHOW THE DESCRIPTION, I THINK THEY
 * SHOULD", and Brian's ticket says every player surface. Both facts reached
 * the focused panel and stopped there, so a player reading their list of
 * invitations saw neither — and until the title became a link, nothing on the
 * card led to the panel that had them either. Labelled as the public event
 * page labels them, and absent rather than "not recorded" when the operator
 * left the field empty, which is how the panel already treats them.
 */
function eventFacts(entry: PlayerHomeInvitation) {
  if (entry.description === null && entry.requiredEquipment === null) return null;
  return (
    <FactGrid key="event-facts" columns={1}>
      {entry.requiredEquipment ? (
        <Fact
          label={EQUIPMENT_LABEL}
          value={entry.requiredEquipment}
          multiline
          testId="summary-equipment"
        />
      ) : null}
      {entry.description ? (
        <Fact
          label={DESCRIPTION_LABEL}
          value={entry.description}
          multiline
          testId="summary-description"
        />
      ) : null}
    </FactGrid>
  );
}

export function SummaryRow({
  token,
  entry,
  dominant,
}: {
  token: string;
  entry: PlayerHomeInvitation;
  dominant: boolean;
}) {
  const sentence = rowSentence(entry);
  const facts = eventFacts(entry);

  return (
    <RowCard
      title={
        <Link href={openHref(token, entry.invitationId)} underline="hover" color="inherit">
          {entry.eventName}
        </Link>
      }
      sublines={[
        entry.templateName,
        when(entry),
        ...(sentence ? [sentence] : []),
        ...(facts ? [facts] : []),
      ]}
      chips={
        <StatusChip
          domain="rsvp"
          status={entry.standingAnswer ?? "none"}
          label={
            entry.standingAnswer === null
              ? dominant
                ? NEXT_CHIP
                : AWAITING_ANSWER_CHIP
              : entry.standingAnswer === "no" && entry.reasonIsDefault
                ? NO_REASON_GIVEN
                : entry.standingAnswer === "yes"
                  ? STANDING_YES
                  : STANDING_NO
          }
        />
      }
      actions={<RowActions token={token} entry={entry} />}
    />
  );
}
