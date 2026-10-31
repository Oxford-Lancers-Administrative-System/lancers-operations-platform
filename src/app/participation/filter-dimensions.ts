import {
  ANSWER_FILTERS,
  ATTENDANCE_FILTERS,
  type ParticipationFilterKey,
  type ParticipationFilters,
} from "@/lib/services/participation-view";

import {
  ANSWER_NO,
  ANSWER_NONE,
  ANSWER_YES,
  CAPACITY_LABELS,
  DELIVERY_LABELS,
  DELIVERY_NOT_QUEUED,
  FILTER_CAPACITIES,
  NEEDS_ATTENTION_FILTER_LABEL,
  NOT_DELIVERED,
  NOT_RECORDED,
  PRESENCE_LABELS,
  TABLE_HEADINGS,
  WALK_UP_LABEL,
} from "./presentation";

/**
 * LAN-511 (Brian's walk, 31 October): Everyone asked filters from a funnel in
 * the As, Answer, Attendance and Delivery headings, as the roster board does,
 * and below the desktop table's width from one select per filter, as the
 * roster's phone does. Both read their choices from here, so the two can never
 * offer different things. Each label is the column's own heading.
 */
export interface ParticipationFilterDimension {
  readonly key: ParticipationFilterKey;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

const ANSWER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  yes: ANSWER_YES,
  no: ANSWER_NO,
  none: ANSWER_NONE,
});

const CAPACITY: ParticipationFilterDimension = Object.freeze({
  key: "capacity",
  label: TABLE_HEADINGS.capacity,
  options: [
    ...FILTER_CAPACITIES.map((value) => ({ value, label: CAPACITY_LABELS[value] })),
    { value: "walk_up", label: WALK_UP_LABEL },
  ],
});

const ANSWER: ParticipationFilterDimension = Object.freeze({
  key: "answer",
  label: TABLE_HEADINGS.answer,
  options: ANSWER_FILTERS.map((value) => ({ value, label: ANSWER_LABELS[value] })),
});

const ATTENDANCE: ParticipationFilterDimension = Object.freeze({
  key: "attendance",
  label: TABLE_HEADINGS.attendance,
  options: ATTENDANCE_FILTERS.map((value) => ({
    value,
    label:
      value === "not_recorded"
        ? NOT_RECORDED
        : PRESENCE_LABELS[value as keyof typeof PRESENCE_LABELS],
  })),
});

const DELIVERY: ParticipationFilterDimension = Object.freeze({
  key: "delivery",
  label: TABLE_HEADINGS.delivery,
  options: [
    { value: "attention", label: NEEDS_ATTENTION_FILTER_LABEL },
    ...Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label })),
    // LAN-411: one option, over Attempted rather than beside the five.
    { value: "not_delivered", label: NOT_DELIVERED },
    { value: "none", label: DELIVERY_NOT_QUEUED },
  ],
});

/** The filters this tier offers, in the desktop table's column order. Delivery is the operator's alone. */
export function participationFilterDimensions(
  showDelivery: boolean,
): readonly ParticipationFilterDimension[] {
  return showDelivery ? [CAPACITY, DELIVERY, ANSWER, ATTENDANCE] : [CAPACITY, ANSWER, ATTENDANCE];
}

export function participationFilterDimension(
  key: ParticipationFilterKey,
): ParticipationFilterDimension {
  return { capacity: CAPACITY, answer: ANSWER, attendance: ATTENDANCE, delivery: DELIVERY }[key];
}

/** The chosen option's label, or the raw value when it is not one of the options. */
export function filterChoiceLabel(dimension: ParticipationFilterDimension, value: string): string {
  return dimension.options.find((option) => option.value === value)?.label ?? value;
}

/** The filters in force, in the dimensions' order. */
export function activeParticipationFilters(
  filters: ParticipationFilters,
  showDelivery: boolean,
): readonly { dimension: ParticipationFilterDimension; value: string }[] {
  return participationFilterDimensions(showDelivery)
    .filter((dimension) => filters[dimension.key] !== "")
    .map((dimension) => ({ dimension, value: filters[dimension.key] }));
}
