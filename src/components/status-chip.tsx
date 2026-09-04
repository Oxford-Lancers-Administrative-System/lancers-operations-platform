import Chip from "@mui/material/Chip";

/**
 * One status → colour vocabulary for the whole application — LAN-225, brief
 * §1.3. Filled chips for stored statuses, outlined for derived or secondary
 * facts, always with the word: `label` is required and comes from the owning
 * vocabulary module (`*-vocabulary.ts`, `presentation.ts`), never from here.
 * Nothing in this file renames a state.
 *
 * `neutral` is "not yet, none, archived" — the chip MUI would call `default`,
 * drawn in the club's own grey so it sits with the rest.
 */
export type StatusColour = "success" | "info" | "warning" | "error" | "neutral" | "primary";
export type StatusVariant = "filled" | "outlined";

export interface StatusStyle {
  readonly colour: StatusColour;
  readonly variant: StatusVariant;
}

export type StatusDomain =
  | "membership"
  | "personType"
  | "event"
  | "delivery"
  | "recruitment"
  | "attendance"
  | "rsvp"
  | "operator"
  | "onboardingItem"
  | "availability";

const filled = (colour: StatusColour): StatusStyle => ({ colour, variant: "filled" });
const outlined = (colour: StatusColour): StatusStyle => ({ colour, variant: "outlined" });

/** Brief §1.3, one row per domain. Keys are the stored codes. */
export const STATUS_VOCABULARY: Readonly<
  Record<StatusDomain, Readonly<Record<string, StatusStyle>>>
> = Object.freeze({
  membership: Object.freeze({
    active: filled("success"),
    onboarding: filled("info"),
    inactive: filled("warning"),
    departed: filled("neutral"),
    archived: filled("neutral"),
  }),
  personType: Object.freeze({
    player: outlined("primary"),
    recruit: filled("neutral"),
  }),
  event: Object.freeze({
    approved: filled("success"),
    draft: filled("neutral"),
    occurred: filled("neutral"),
    upcoming: outlined("success"),
    cancelled: outlined("error"),
  }),
  delivery: Object.freeze({
    delivered: filled("success"),
    attempted: filled("info"),
    retryable: filled("warning"),
    held: filled("warning"),
    whatsapp_unresponsive: filled("warning"),
    failed: filled("error"),
    no_channel: filled("error"),
    escalated: outlined("error"),
    queued: filled("neutral"),
    cancelled: filled("neutral"),
  }),
  recruitment: Object.freeze({
    joined: filled("success"),
    engaged: filled("info"),
    committed: filled("info"),
    disengaged: filled("warning"),
    declined: filled("error"),
    identified: filled("neutral"),
    void: filled("neutral"),
  }),
  attendance: Object.freeze({
    present: filled("success"),
    late: filled("warning"),
    excused: filled("info"),
    absent: filled("error"),
    not_recorded: filled("neutral"),
  }),
  rsvp: Object.freeze({
    yes: filled("success"),
    attending: filled("success"),
    no: filled("error"),
    not_attending: filled("error"),
    none: filled("neutral"),
    no_response: filled("neutral"),
  }),
  operator: Object.freeze({
    active: filled("success"),
    invitation_pending: filled("warning"),
    email_change_pending: filled("warning"),
    delivery_failed: filled("error"),
    deactivated: filled("neutral"),
  }),
  // Not in the brief's table: the onboarding item states the player record
  // and the report both show. Added here so they read one way on both.
  onboardingItem: Object.freeze({
    complete: filled("success"),
    pending: outlined("warning"),
    outstanding: outlined("warning"),
    waived: outlined("neutral"),
    not_applicable: outlined("neutral"),
    // The two item flags the record shows beside a status: facts, outlined.
    required: outlined("neutral"),
    never_blocks: outlined("neutral"),
  }),
  // The board's traffic light for standing availability, from the semantic set.
  availability: Object.freeze({
    green: filled("success"),
    orange: filled("warning"),
    red: filled("error"),
  }),
});

/** Unknown codes read as `neutral filled` — a state nobody has classified is "not yet", never red. */
export function statusStyle(domain: StatusDomain, status: string): StatusStyle {
  return STATUS_VOCABULARY[domain][status] ?? filled("neutral");
}

export function StatusChip({
  domain,
  status,
  label,
  size = "small",
  testId,
}: {
  domain: StatusDomain;
  status: string;
  /** The club's word for the state. Required: colour is never the only signal. */
  label: string;
  size?: "small" | "medium";
  testId?: string;
}) {
  const style = statusStyle(domain, status);
  return (
    <Chip
      size={size}
      label={label}
      color={style.colour}
      variant={style.variant}
      data-testid={testId}
      data-status={status}
      data-domain={domain}
    />
  );
}
