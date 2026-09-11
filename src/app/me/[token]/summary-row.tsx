/**
 * One invitation's summary card — title, sublines, the state sentence, the
 * status chip and its row actions. Split from `page.tsx` (LAN-300).
 */
import { RowCard } from "@/components/row-card";
import { StatusChip } from "@/components/status-chip";

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
import { RowActions } from "./row-actions";

export function when(entry: PlayerHomeInvitation): string | null {
  const date = formatEventDate(entry.scheduledOn);
  const time = formatEventTime(entry.startsAt, entry.endsAt);
  return [date, time].filter(Boolean).join(" · ") || null;
}

/** The row's own one-line state sentence — Q-23's "what the copy says". */
function rowSentence(entry: PlayerHomeInvitation): string | null {
  if (entry.standingAnswer === null) {
    // The club has already followed up once — that fact is what separates
    // `Still need your answer` from `New invitations`, so it leads the row
    // rather than being crowded out by the count/deadline line every
    // unanswered row also carries.
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

  return (
    <RowCard
      title={entry.eventName}
      sublines={[entry.templateName, when(entry), ...(sentence ? [sentence] : [])]}
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
