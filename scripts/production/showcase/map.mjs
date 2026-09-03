/**
 * The workflow map — LAN-221, Part 1.
 *
 * One row per workflow across the six missions, sourced from the intake
 * ledgers and the packets. For each: the route(s) it touches, the role that
 * performs it, the tester who gets it, and the **data states that have to
 * exist for it to be visible and exercisable**. Its only job is to drive the
 * dataset (Part 2, whose verifier counts these states) and the checklists
 * (Part 3, whose links resolve through these routes).
 *
 * `STATES` is the vocabulary. Every key is a predicate over the rows the
 * loader tags with it — `verify` proves each tagged row exists in the target
 * and satisfies the predicate, and that the floor (`min`) is met. A state that
 * the shipped application cannot yet hold carries `arrivesWith`, the package
 * that will produce it; the verifier reports those rather than counting them.
 *
 * `WORKFLOWS` is the map itself. Route templates carry `{example.key}`
 * placeholders, resolved from the plan's example identifiers by the checklist
 * generator and by the rendered index, so a link is written before the load
 * and resolves after it.
 *
 * Rendered: `docs/tester-week/workflow-map.md` (the table) and
 * `docs/tester-week/index.html` (the browsable map). Regenerate with
 *
 *     node scripts/production/showcase/map.mjs --write
 *
 * `tests/showcase-map.test.ts` fails when either drifts from this module.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { formatAs } from "../../intake/lib/format.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../..");
export const MAP_MARKDOWN = "docs/tester-week/workflow-map.md";
export const MAP_HTML = "docs/tester-week/index.html";

export const TESTERS = Object.freeze({
  stewart: { name: "Stewart", role: "General Manager", file: "stewart.md" },
  clint: { name: "Clint", role: "President", file: "clint.md" },
  brian: { name: "Brian", role: "IT Officer", file: "brian.md" },
  coach: {
    name: "The coach seat",
    role: "Head Coach — on a phone, at the pitch",
    file: "coach.md",
  },
});

export const MISSIONS = Object.freeze([
  {
    id: "M-OPERATOR-ADMIN-WITHOUT-SQL",
    short: "M1",
    title: "Operator administration",
    intake: false,
  },
  { id: "M-EVENTS-CALENDAR-TARGET-STATE", short: "M2", title: "Events and calendar", intake: true },
  {
    id: "M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY",
    short: "M4",
    title: "Messaging, reminders and recovery",
    intake: true,
  },
  { id: "M-PEOPLE-AND-ROSTER", short: "M5", title: "People and roster", intake: true },
  { id: "M-RECRUITMENT", short: "M6", title: "Recruitment", intake: true },
  { id: "M-ONBOARDING-AND-INFORMATION-COMPLETION", short: "M7", title: "Onboarding", intake: true },
]);

/** `[key, label, table, where, min]`, or `[key, label, arrivesWith]` for a state not yet producible. */
const STATE_ROWS = [
  // People
  [
    "person.player",
    "A person with a season membership",
    "public.people",
    "exists (select 1 from public.season_memberships m where m.person_id = t.id)",
    30,
  ],
  [
    "person.first-name-only",
    "A player recorded with a first name only",
    "public.people",
    "t.family_name is null",
    5,
  ],
  [
    "person.near-duplicate",
    "A second record that is probably the same human",
    "public.people",
    "t.merged_into_person_id is null",
    2,
  ],
  [
    "person.merged",
    "A losing record kept after a merge",
    "public.people",
    "t.merged_into_person_id is not null and t.merge_reason is not null",
    1,
  ],
  [
    "person.under-18",
    "A person the date of birth flags as under 18",
    "public.people",
    "t.date_of_birth > (current_date - interval '18 years')::date",
    1,
  ],
  [
    "person.missing-required",
    "A player with a required fact not recorded",
    "public.people",
    "t.date_of_birth is null or not exists (select 1 from public.person_emergency_contacts e where e.person_id = t.id)",
    5,
  ],
  [
    "person.past-member",
    "A person with a membership last season and none this season",
    "public.people",
    "not exists (select 1 from public.season_memberships m join public.seasons s on s.id = m.season_id where m.person_id = t.id and s.status <> 'archived')",
    2,
  ],
  [
    "person.staff-only",
    "A committee or coaching seat holder who is not a player",
    "public.people",
    "not exists (select 1 from public.season_memberships m where m.person_id = t.id)",
    5,
  ],
  [
    "person.recruit",
    "A person known only as a recruit",
    "public.people",
    "exists (select 1 from public.recruitment_prospects r where r.person_id = t.id)",
    10,
  ],
  ["person.alias", "A person with another name form on file", "public.person_aliases", "true", 5],
  [
    "person.alias.display",
    "An alias flagged as the display name",
    "public.person_aliases",
    "t.is_display_name",
    2,
  ],
  [
    "person.emergency-contact",
    "An emergency contact on file",
    "public.person_emergency_contacts",
    "true",
    20,
  ],
  [
    "contact.phone",
    "A mobile number on file",
    "public.contact_points",
    "t.kind = 'phone' and t.is_preferred",
    40,
  ],
  [
    "contact.phone.malformed",
    "A number typed in a shape the club cannot normalise",
    "public.contact_points",
    "t.kind = 'phone' and t.normalised_value is null",
    5,
  ],
  ["contact.email", "An email address on file", "public.contact_points", "t.kind = 'email'", 20],
  [
    "contact.email.malformed",
    "An email address with a typo",
    "public.contact_points",
    "t.kind = 'email' and t.normalised_value is null",
    1,
  ],
  [
    "contact.superseded",
    "A previous contact value, dated and kept",
    "public.contact_points",
    "t.valid_until is not null and not t.is_preferred",
    1,
  ],
  [
    "consent.granted",
    "Messaging consent granted this season",
    "public.season_messaging_consents",
    "t.state = 'granted'",
    20,
  ],
  [
    "consent.asked",
    "Messaging consent asked and not answered",
    "public.season_messaging_consents",
    "t.state = 'asked'",
    1,
  ],
  [
    "consent.never_asked",
    "Messaging consent never asked",
    "public.season_messaging_consents",
    "t.state = 'never_asked'",
    1,
  ],
  [
    "consent.refused",
    "Messaging consent refused",
    "public.season_messaging_consents",
    "t.state = 'refused'",
    2,
  ],
  [
    "consent.withdrawn",
    "Messaging consent withdrawn",
    "public.season_messaging_consents",
    "t.state = 'withdrawn'",
    1,
  ],
  // Memberships
  [
    "membership.active",
    "An active membership",
    "public.season_memberships",
    "t.status = 'active'",
    20,
  ],
  [
    "membership.inactive",
    "An inactive membership with a label and a return date",
    "public.season_memberships",
    "t.status = 'inactive' and t.inactivity_label is not null",
    3,
  ],
  [
    "membership.onboarding",
    "A membership still onboarding",
    "public.season_memberships",
    "t.status = 'onboarding'",
    5,
  ],
  [
    "membership.departed",
    "A departed membership with a dated reason",
    "public.season_memberships",
    "t.status = 'departed' and t.departed_on is not null",
    2,
  ],
  [
    "membership.archived",
    "Last season's membership, archived",
    "public.season_memberships",
    "t.status = 'archived'",
    20,
  ],
  [
    "membership.entry.new",
    "A new entry this season",
    "public.season_memberships",
    "t.entry = 'new'",
    5,
  ],
  [
    "membership.entry.returning",
    "A returner carried forward from last season",
    "public.season_memberships",
    "t.entry = 'returning' and t.carried_forward_from_id is not null",
    20,
  ],
  [
    "membership.from-recruit",
    "A membership a recruit flip created",
    "public.season_memberships",
    "exists (select 1 from public.recruitment_prospects r where r.converted_membership_id = t.id)",
    1,
  ],
  [
    "membership.status-event",
    "A recorded membership status transition",
    "public.season_membership_status_events",
    "true",
    50,
  ],
  [
    "availability.green",
    "Availability green, confirmed",
    "public.availability_statuses",
    "t.level = 'green'",
    20,
  ],
  [
    "availability.orange",
    "Availability orange with a review date",
    "public.availability_statuses",
    "t.level = 'orange' and t.review_on is not null",
    2,
  ],
  [
    "availability.red",
    "Availability red with a review date",
    "public.availability_statuses",
    "t.level = 'red' and t.review_on is not null",
    2,
  ],
  [
    "position.assigned",
    "A position assignment",
    "public.position_assignments",
    "t.effective_to is null",
    30,
  ],
  ["jersey.assigned", "A jersey number", "public.jersey_assignments", "t.is_predominant", 20],
  ["eligibility.recorded", "An eligibility record", "public.eligibility_records", "true", 20],
  ["blues.awarded", "A Blue on record", "public.blues_awards", "true", 2],
  [
    "seat.held",
    "A committee or coaching seat with a holder",
    "public.role_assignments",
    "t.effective_from <= current_date and (t.effective_to is null or t.effective_to > current_date)",
    8,
  ],
  // Recruits
  [
    "prospect.identified",
    "A recruit at identified",
    "public.recruitment_prospects",
    "t.status = 'identified'",
    3,
  ],
  [
    "prospect.engaged",
    "A recruit at engaged",
    "public.recruitment_prospects",
    "t.status = 'engaged'",
    3,
  ],
  [
    "prospect.committed",
    "A recruit at committed, dated",
    "public.recruitment_prospects",
    "t.status = 'committed' and t.committed_on is not null",
    2,
  ],
  [
    "prospect.joined",
    "A recruit flipped to joined, with the membership it created",
    "public.recruitment_prospects",
    "t.status = 'joined' and t.converted_membership_id is not null",
    1,
  ],
  [
    "prospect.declined",
    "A recruit who declined",
    "public.recruitment_prospects",
    "t.status = 'declined'",
    2,
  ],
  [
    "prospect.disengaged",
    "A recruit who went quiet",
    "public.recruitment_prospects",
    "t.status = 'disengaged'",
    2,
  ],
  [
    "prospect.void",
    "A record that should never have existed",
    "public.recruitment_prospects",
    "t.status = 'void'",
    1,
  ],
  [
    "prospect.walk-up",
    "A recruit captured at the door",
    "public.recruitment_prospects",
    "t.source like 'Walk-on%'",
    1,
  ],
  [
    "prospect.possible-duplicate",
    "A recruit sharing a number with somebody on file",
    "public.recruitment_prospects",
    "exists (select 1 from public.contact_points c1 join public.contact_points c2 on c2.normalised_value = c1.normalised_value and c2.person_id <> c1.person_id where c1.person_id = t.person_id)",
    1,
  ],
  [
    "prospect.note",
    "A dated, attributed note on a recruit",
    "public.recruitment_prospect_notes",
    "true",
    3,
  ],
  [
    "prospect.status-event",
    "A recorded recruit status transition",
    "public.recruitment_prospect_status_events",
    "true",
    14,
  ],
  [
    "questionnaire.answered",
    "A recruitment questionnaire answer",
    "public.recruitment_questionnaire_responses",
    "t.superseded_at is null",
    12,
  ],
  [
    "job.recruit-cycle.welcome",
    "The recruit welcome, delivered",
    "public.notification_jobs",
    "t.idempotency_key like 'recruit-cycle:welcome:%' and t.status = 'completed'",
    5,
  ],
  [
    "job.recruit-cycle.interest_ask",
    "The recruitment questionnaire ask, delivered",
    "public.notification_jobs",
    "t.idempotency_key like 'recruit-cycle:interest_ask:%' and t.status = 'completed'",
    3,
  ],
  [
    "token.interest.spent",
    "A recruit's questionnaire link, used",
    "public.person_access_tokens",
    "t.purpose = 'recruit_interest_request' and t.single_use_at is not null",
    2,
  ],
  [
    "signup-code.live",
    "The season's sign-up QR, live",
    "public.recruitment_signup_codes",
    "t.deactivated_at is null",
    1,
  ],
  [
    "signup-code.retired",
    "A retired sign-up QR",
    "public.recruitment_signup_codes",
    "t.deactivated_at is not null",
    1,
  ],
  // Events
  ["event.type.practice", "A practice", "public.events", "t.event_type = 'practice'", 10],
  [
    "event.type.strength_and_conditioning",
    "An S&C session",
    "public.events",
    "t.event_type = 'strength_and_conditioning'",
    5,
  ],
  ["event.type.chalk", "A chalk talk", "public.events", "t.event_type = 'chalk'", 2],
  ["event.type.game", "A game", "public.events", "t.event_type = 'game'", 2],
  ["event.type.social", "A social", "public.events", "t.event_type = 'social'", 2],
  [
    "event.type.recruitment",
    "A recruitment event",
    "public.events",
    "t.event_type = 'recruitment'",
    2,
  ],
  ["event.type.meeting", "A meeting", "public.events", "t.event_type = 'meeting'", 2],
  [
    "event.draft.no-audience",
    "A draft with no audience",
    "public.events",
    "t.status = 'draft' and not exists (select 1 from public.event_audience_members a where a.event_id = t.id)",
    2,
  ],
  [
    "event.draft.audience-confirmed",
    "A draft with its audience confirmed, ready to approve",
    "public.events",
    "t.status = 'draft' and t.audience_confirmed_at is not null and exists (select 1 from public.event_audience_members a where a.event_id = t.id)",
    2,
  ],
  [
    "event.approved.upcoming",
    "An approved event still to come",
    "public.events",
    "t.status = 'approved' and t.scheduled_on >= current_date",
    2,
  ],
  [
    "event.approved.partial-responses",
    "An approved event with some answers and some silence",
    "public.events",
    "t.status = 'approved' and exists (select 1 from public.invitations i join public.current_rsvp r on r.invitation_id = i.id where i.event_id = t.id) and exists (select 1 from public.invitations i where i.event_id = t.id and not exists (select 1 from public.current_rsvp r where r.invitation_id = i.id))",
    2,
  ],
  [
    "event.occurred.register",
    "An event that happened, with a register",
    "public.events",
    "t.status = 'approved' and t.scheduled_on < current_date and exists (select 1 from public.attendance_records a where a.event_id = t.id)",
    10,
  ],
  [
    "event.occurred.no-register",
    "An event that happened and nobody took the register",
    "public.events",
    "t.status = 'approved' and t.scheduled_on < current_date and not exists (select 1 from public.attendance_records a where a.event_id = t.id)",
    2,
  ],
  [
    "event.cancelled.not-held",
    "A session called off, with the reason",
    "public.events",
    "t.status = 'cancelled' and t.decision_reason is not null and t.scheduled_on < current_date",
    1,
  ],
  [
    "event.cancelled.after-publication",
    "An event cancelled after it was announced, everyone told",
    "public.events",
    "t.status = 'cancelled' and t.scheduled_on >= current_date and exists (select 1 from public.notification_jobs j where j.event_id = t.id and j.job_type = 'cancellation_notice')",
    1,
  ],
  [
    "event.amended.notified",
    "An amended event whose audience was told",
    "public.events",
    "exists (select 1 from public.schedule_changes s where s.event_id = t.id and s.notified)",
    2,
  ],
  [
    "event.amended.silent",
    "An amended event whose audience was not told",
    "public.events",
    "exists (select 1 from public.schedule_changes s where s.event_id = t.id and not s.notified)",
    1,
  ],
  [
    "event.held",
    "An event with reminders on hold after an amendment",
    "public.events",
    "exists (select 1 from public.notification_jobs j where j.event_id = t.id and j.held_at is not null)",
    1,
  ],
  [
    "event.alternative",
    "An event in an alternative-slot group",
    "public.events",
    "t.alternative_group_id is not null",
    2,
  ],
  [
    "event.online",
    "An online event with a joining link",
    "public.events",
    "t.delivery_mode = 'online' and t.joining_url is not null",
    2,
  ],
  [
    "event.questions",
    "An event asking questions",
    "public.events",
    "exists (select 1 from public.event_questions q where q.event_id = t.id)",
    2,
  ],
  [
    "event.term-card",
    "A term-card draft, as an import leaves it",
    "public.events",
    "t.term_id is not null and t.status = 'draft'",
    20,
  ],
  [
    "event.non-soliciting",
    "A committee event that asks nobody to answer",
    "public.events",
    "t.status = 'approved' and t.event_type = 'meeting' and not exists (select 1 from public.invitations i join public.current_rsvp r on r.invitation_id = i.id where i.event_id = t.id)",
    2,
  ],
  ["event.mandatory", "A mandatory event", "public.events", "t.is_mandatory", 10],
  ["event.optional", "An optional event", "public.events", "not t.is_mandatory", 10],
  [
    "alternative-group.defined",
    "An alternative-slot group",
    "public.alternative_groups",
    "true",
    1,
  ],
  ["series.defined", "A recurring series", "public.event_series", "true", 3],
  ["audience.member", "A confirmed audience member", "public.event_audience_members", "true", 500],
  [
    "invitation.responded",
    "An invitation that was answered",
    "public.invitations",
    "t.status = 'responded'",
    100,
  ],
  [
    "invitation.expired",
    "An invitation that went unanswered past its deadline",
    "public.invitations",
    "t.status = 'expired'",
    20,
  ],
  [
    "invitation.cancelled",
    "An invitation cancelled with its event",
    "public.invitations",
    "t.status = 'cancelled' and t.cancelled_at is not null",
    10,
  ],
  [
    "invitation.recruit",
    "An invitation to a recruit",
    "public.invitations",
    "t.capacity = 'recruit'",
    3,
  ],
  ["rsvp.yes", "A yes", "public.rsvp_responses", "t.response = 'yes'", 100],
  [
    "rsvp.no",
    "A no, with the reason",
    "public.rsvp_responses",
    "t.response = 'no' and t.reason is not null",
    20,
  ],
  [
    "rsvp.recorded-in-person",
    "An answer an operator recorded for somebody",
    "public.rsvp_responses",
    "t.source = 'operator' and t.recorded_by_person_id is not null",
    5,
  ],
  [
    "rsvp.changed",
    "An answer that was changed, both kept",
    "public.rsvp_responses",
    "exists (select 1 from public.rsvp_responses o where o.invitation_id = t.invitation_id and o.id <> t.id)",
    1,
  ],
  ["question.asked", "An event question", "public.event_questions", "true", 4],
  ["question.answered", "An answer to an event question", "public.question_responses", "true", 20],
  [
    "attendance.present",
    "Marked present",
    "public.attendance_records",
    "t.presence = 'present'",
    20,
  ],
  ["attendance.late", "Marked late", "public.attendance_records", "t.presence = 'late'", 5],
  [
    "attendance.excused",
    "Marked excused",
    "public.attendance_records",
    "t.presence = 'excused'",
    2,
  ],
  ["attendance.absent", "Marked absent", "public.attendance_records", "t.presence = 'absent'", 5],
  [
    "attendance.walk-up",
    "Present, never invited",
    "public.attendance_records",
    "not exists (select 1 from public.invitations i where i.event_id = t.event_id and coalesce(i.season_membership_id, i.person_id) = coalesce(t.season_membership_id, t.person_id))",
    2,
  ],
  [
    "attendance.recruit",
    "A recruit on the register",
    "public.attendance_records",
    "t.capacity = 'recruit'",
    1,
  ],
  [
    "attendance.said-no-attended",
    "Said no, turned up anyway",
    "public.attendance_records",
    "t.presence in ('present','late') and exists (select 1 from public.invitations i join public.current_rsvp r on r.invitation_id = i.id where i.event_id = t.event_id and coalesce(i.season_membership_id, i.person_id) = coalesce(t.season_membership_id, t.person_id) and r.response = 'no')",
    2,
  ],
  [
    "attendance.said-yes-absent",
    "Said yes, marked absent",
    "public.attendance_records",
    "t.presence = 'absent' and exists (select 1 from public.invitations i join public.current_rsvp r on r.invitation_id = i.id where i.event_id = t.event_id and coalesce(i.season_membership_id, i.person_id) = coalesce(t.season_membership_id, t.person_id) and r.response = 'yes')",
    2,
  ],
  [
    "token.rsvp.expired",
    "An RSVP link that has expired",
    "public.rsvp_access_tokens",
    "t.revoked_at is null and t.expires_at <= now()",
    50,
  ],
  [
    "token.rsvp.used",
    "An RSVP link that was used",
    "public.rsvp_access_tokens",
    "t.use_count > 0 and t.last_used_at is not null",
    50,
  ],
  [
    "token.rsvp.revoked",
    "An RSVP link revoked and reissued",
    "public.rsvp_access_tokens",
    "t.revoked_at is not null and t.superseded_by_token_id is not null",
    1,
  ],
  [
    "token.rsvp.live",
    "A live RSVP link — only for a named tester",
    "public.rsvp_access_tokens",
    "t.revoked_at is null and t.expires_at > now()",
    0,
  ],
  ["club-link.live", "A live club link", "public.club_link_tokens", "t.revoked_at is null", 1],
  [
    "club-link.revoked",
    "A revoked club link",
    "public.club_link_tokens",
    "t.revoked_at is not null",
    1,
  ],
  [
    "amendment.notified",
    "A schedule change that was announced",
    "public.schedule_changes",
    "t.notified",
    2,
  ],
  [
    "amendment.silent",
    "A schedule change that was not announced",
    "public.schedule_changes",
    "not t.notified",
    1,
  ],
  // Messaging
  [
    "plan.frozen",
    "A messaging plan frozen at approval",
    "public.event_messaging_plans",
    "t.frozen_at is not null",
    20,
  ],
  [
    "plan.late-approval",
    "A compressed plan for a short-notice approval",
    "public.event_messaging_plans",
    "t.late_approval and t.escalation_at is null",
    2,
  ],
  [
    "job.completed",
    "A message that was sent",
    "public.notification_jobs",
    "t.status = 'completed'",
    500,
  ],
  [
    "job.invitation",
    "An invitation sent",
    "public.notification_jobs",
    "t.job_type = 'invitation' and t.ladder_rung = 0",
    300,
  ],
  [
    "job.reminder",
    "A WhatsApp reminder sent",
    "public.notification_jobs",
    "t.job_type = 'reminder' and t.channel = 'whatsapp' and t.status = 'completed'",
    100,
  ],
  [
    "job.email-rung",
    "The email rung, carried",
    "public.notification_jobs",
    "t.job_type = 'reminder' and t.channel = 'email' and t.status = 'completed'",
    50,
  ],
  [
    "job.cancelled.answered",
    "A reminder called off because the answer arrived",
    "public.notification_jobs",
    "t.status = 'cancelled' and t.cancelled_reason like 'The invitee responded%'",
    50,
  ],
  [
    "job.cancelled.event",
    "A reminder called off with the event",
    "public.notification_jobs",
    "t.status = 'cancelled' and t.cancelled_reason like 'The event was cancelled%'",
    10,
  ],
  [
    "job.held",
    "A reminder held after an amendment",
    "public.notification_jobs",
    "t.held_at is not null and t.held_reason is not null",
    5,
  ],
  [
    "job.failed.terminal",
    "A message the provider refused until retries ran out",
    "public.notification_jobs",
    "t.status = 'failed' and t.attempt_count >= 5",
    3,
  ],
  [
    "job.failed.no-route",
    "Somebody with no usable route",
    "public.notification_jobs",
    "t.status = 'failed' and t.last_error like 'No usable mobile number%'",
    3,
  ],
  [
    "job.failed.whatsapp",
    "A WhatsApp failure",
    "public.notification_jobs",
    "t.status = 'failed' and t.last_error = 'WhatsApp did not accept this message.'",
    3,
  ],
  [
    "job.email-fallback",
    "The email fallback that carried a WhatsApp failure",
    "public.notification_jobs",
    "t.idempotency_key like '%:email-fallback' and t.status = 'completed'",
    3,
  ],
  [
    "job.failed.no-consent",
    "A recruit refused a message for want of consent",
    "public.notification_jobs",
    "t.status = 'failed' and t.last_error like 'No messaging consent%'",
    1,
  ],
  [
    "job.escalation",
    "The President's escalation, sent",
    "public.notification_jobs",
    "t.job_type = 'escalation' and t.status = 'completed'",
    3,
  ],
  [
    "job.cancellation-notice",
    "A cancellation notice, sent",
    "public.notification_jobs",
    "t.job_type = 'cancellation_notice' and t.status = 'completed'",
    10,
  ],
  [
    "job.schedule-change-notice",
    "A change notice, sent",
    "public.notification_jobs",
    "t.job_type = 'schedule_change_notice' and t.status = 'completed'",
    10,
  ],
  [
    "job.onboarding-welcome",
    "The onboarding welcome, sent",
    "public.notification_jobs",
    "t.idempotency_key like 'onboarding-welcome:%' and t.status = 'completed'",
    5,
  ],
  [
    "job.recruit-follow-up",
    "A recruit's one follow-up",
    "public.notification_jobs",
    "t.idempotency_key like '%:reminder:recruit:%'",
    2,
  ],
  [
    "delivery.delivered",
    "A delivered result",
    "public.delivery_results",
    "t.outcome = 'delivered'",
    500,
  ],
  ["delivery.failed", "A failed result", "public.delivery_results", "t.outcome = 'failed'", 20],
  [
    "delivery.rejected",
    "A rejected result",
    "public.delivery_results",
    "t.outcome = 'rejected'",
    5,
  ],
  [
    "delivery.manual",
    "A message posted by hand, with its actor",
    "public.delivery_results",
    "t.outcome = 'manual' and t.actor_person_id is not null",
    2,
  ],
  [
    "delivery.attempt.accepted",
    "A provider attempt, accepted",
    "public.delivery_attempts",
    "t.accepted_at is not null",
    500,
  ],
  [
    "delivery.attempt.failed",
    "A provider attempt, failed",
    "public.delivery_attempts",
    "t.failure_reason is not null",
    20,
  ],
  [
    "flag.raised",
    "A nonresponse flag still open",
    "public.nonresponse_flags",
    "t.resolved_at is null",
    10,
  ],
  [
    "flag.resolved",
    "A nonresponse flag resolved by a human",
    "public.nonresponse_flags",
    "t.resolved_at is not null and t.resolved_by_person_id is not null",
    5,
  ],
  // Onboarding
  [
    "onboarding.item.pending",
    "A checklist item pending",
    "public.onboarding_items",
    "t.status = 'pending'",
    10,
  ],
  [
    "onboarding.item.invited",
    "A checklist item asked for",
    "public.onboarding_items",
    "t.status = 'invited'",
    2,
  ],
  [
    "onboarding.item.claimed",
    "A checklist item the player says is done",
    "public.onboarding_items",
    "t.status = 'claimed'",
    3,
  ],
  [
    "onboarding.item.complete",
    "A checklist item complete",
    "public.onboarding_items",
    "t.status = 'complete' and t.completed_on is not null",
    100,
  ],
  [
    "onboarding.item.waived",
    "A checklist item waived, reason-free",
    "public.onboarding_items",
    "t.status = 'waived' and t.waived_by_person_id is not null",
    2,
  ],
  [
    "onboarding.item.not_applicable",
    "A checklist item not applicable",
    "public.onboarding_items",
    "t.status = 'not_applicable'",
    2,
  ],
  [
    "onboarding.history.complete",
    "An item's history to complete",
    "public.onboarding_item_history",
    "t.to_status = 'complete'",
    100,
  ],
  [
    "onboarding.history.claimed",
    "An item's history to claimed, by the player",
    "public.onboarding_item_history",
    "t.to_status = 'claimed' and t.actor_kind = 'player'",
    3,
  ],
  [
    "onboarding.history.waived",
    "An item's history to waived, by an operator",
    "public.onboarding_item_history",
    "t.to_status = 'waived' and t.actor_kind = 'operator'",
    2,
  ],
  [
    "onboarding.log.ask",
    "An ask in the activity log",
    "public.onboarding_activity_log",
    "t.kind = 'ask'",
    10,
  ],
  [
    "onboarding.log.answer",
    "An answer in the activity log",
    "public.onboarding_activity_log",
    "t.kind = 'answer'",
    20,
  ],
  [
    "onboarding.agreement.code_of_conduct",
    "A Code of Conduct agreed, versioned",
    "public.onboarding_agreements",
    "t.agreement_type = 'code_of_conduct'",
    10,
  ],
  [
    "onboarding.agreement.photo_release",
    "A photo release agreed, versioned",
    "public.onboarding_agreements",
    "t.agreement_type = 'photo_release'",
    10,
  ],
  [
    "onboarding.membership.ready",
    "A player with nothing outstanding — ready to activate",
    "public.season_memberships",
    "t.status = 'onboarding' and not exists (select 1 from public.onboarding_items i where i.season_membership_id = t.id and i.status in ('pending','invited'))",
    1,
  ],
  [
    "onboarding.membership.outstanding",
    "A player midway through onboarding",
    "public.season_memberships",
    "t.status = 'onboarding' and exists (select 1 from public.onboarding_items i where i.season_membership_id = t.id and i.status in ('pending','invited'))",
    3,
  ],
  [
    "onboarding.membership.refused",
    "A player who refused messaging consent",
    "public.season_memberships",
    "exists (select 1 from public.season_messaging_consents c where c.person_id = t.person_id and c.season_id = t.season_id and c.state = 'refused')",
    1,
  ],
  [
    "onboarding.membership.active-with-outstanding",
    "An active player with a checklist item still open — nothing gates",
    "public.season_memberships",
    "t.status = 'active' and exists (select 1 from public.onboarding_items i where i.season_membership_id = t.id and i.status in ('pending','invited','claimed'))",
    2,
  ],
  [
    "dispute.open",
    "A fact the player and the club disagree on, awaiting a decision",
    "public.person_fact_disputes",
    "t.status = 'open'",
    1,
  ],
  [
    "dispute.resolved",
    "A settled dispute, the losing value retained",
    "public.person_fact_disputes",
    "t.status <> 'open' and t.resolved_by_person_id is not null",
    2,
  ],
  [
    "token.durable.live",
    "A live player-page link — only for a named tester",
    "public.person_access_tokens",
    "not t.single_use and t.revoked_at is null",
    0,
  ],
  // Audit
  ["audit.row", "An audit row", "public.audit_events", "true", 100],
  [
    "audit.person-corrected",
    "A person fact corrected, with who and why",
    "public.audit_events",
    "t.action like 'person\\_%\\_updated'",
    3,
  ],
  [
    "audit.person-merged",
    "A merge on the record",
    "public.audit_events",
    "t.action = 'person_merged'",
    1,
  ],
  [
    "audit.event-approved",
    "An approval on the record",
    "public.audit_events",
    "t.action = 'event.approved'",
    20,
  ],
  [
    "audit.import",
    "A term-card import on the record",
    "public.audit_events",
    "t.action = 'event.imported'",
    1,
  ],
  // Filed by the report phase, not the plan.
  [
    "report.filed",
    "A persisted Monday report, versioned, reconciling with the pages",
    "public.weekly_reports",
    "t.version = 2 and t.supersedes_id is not null",
    1,
  ],
  [
    "follow-up.open",
    "A follow-up action still open",
    "public.follow_up_actions",
    "t.status in ('open','in_progress')",
    2,
  ],
  [
    "follow-up.closed",
    "A follow-up action closed with a note",
    "public.follow_up_actions",
    "t.status in ('resolved','cancelled') and t.resolution_note is not null",
    2,
  ],
  // Not producible until Mission 7's remaining packages merge.
  ["membership.imported", "A squad brought in by CSV import", "LAN-215"],
  ["membership.added-by-hand", "A player added by hand into onboarding", "LAN-215"],
  ["token.onboarding.live", "A player's live welcome link, opened", "LAN-216"],
  ["onboarding.ask.submitted", "A player's questionnaire, submitted", "LAN-216"],
  ["onboarding.nudge.sent", "A nudge sent from the queue", "LAN-218"],
  ["onboarding.chase.exhausted", "A chase that ran out", "LAN-218"],
  ["onboarding.escalation.sent", "The exhausted chase handed to the office", "LAN-218"],
  [
    "operator.invitation.pending",
    "An operator invited and not yet signed in",
    "LAN-138 bootstrap, or a live invitation",
  ],
  ["operator.invitation.failed", "An operator invitation that did not arrive", "a live invitation"],
  ["operator.deactivated", "An operator whose access was ended", "a live action"],
];

export const STATES = Object.freeze(
  STATE_ROWS.map((row) =>
    row.length === 3
      ? { key: row[0], label: row[1], arrivesWith: row[2], table: null, where: null, min: 0 }
      : { key: row[0], label: row[1], table: row[2], where: row[3], min: row[4] },
  ),
);
export const STATE_BY_KEY = new Map(STATES.map((state) => [state.key, state]));

const wf = (mission, id, name, actor, tester, routes, states, expect, extra = {}) => ({
  id: `${mission}:${id}`,
  mission,
  workflow: id,
  name,
  actor,
  tester,
  routes: Array.isArray(routes) ? routes : [routes],
  states,
  expect,
  ...extra,
});

const M1 = "M-OPERATOR-ADMIN-WITHOUT-SQL";
const M2 = "M-EVENTS-CALENDAR-TARGET-STATE";
const M4 = "M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY";
const M5 = "M-PEOPLE-AND-ROSTER";
const M6 = "M-RECRUITMENT";
const M7 = "M-ONBOARDING-AND-INFORMATION-COMPLETION";

export const WORKFLOWS = Object.freeze([
  // M1 — operator administration
  wf(
    M1,
    "WF-open-administration",
    "Open administration",
    "President, General Manager or IT Officer",
    "clint",
    ["/operate/admin/operators", "/operate/admin/roles"],
    ["seat.held", "person.staff-only"],
    "Operators grouped as Standing Officers, Club Officers and Coaches; every committee and coaching seat with its holder; Invite Operator top right.",
  ),
  wf(
    M1,
    "WF-invite-operator",
    "Invite an operator",
    "President, General Manager or IT Officer",
    "brian",
    ["/operate/admin/operators/new"],
    ["person.staff-only", "operator.invitation.pending"],
    "Search finds the existing Person; the invitation is sent and the account reads Invitation pending. An invitation that does not arrive is finding #1.",
  ),
  wf(
    M1,
    "WF-assign-or-end-role",
    "Assign or end a role",
    "President, General Manager or IT Officer",
    "clint",
    ["/operate/admin/roles/{role.kit_manager}", "/operate/admin/operators/{operator.brian}"],
    ["seat.held"],
    "The current holder, the Holder history with former holders, and End role / Replace role on the seat.",
  ),
  wf(
    M1,
    "WF-deactivate-reinstate",
    "Deactivate and reinstate an operator",
    "President, General Manager or IT Officer",
    "brian",
    ["/operate/admin/operators/{operator.brian}"],
    ["operator.deactivated"],
    "Deactivate asks for a reason and ends sign-in without ending roles; Restore brings it back with a preview of the permissions.",
  ),
  wf(
    M1,
    "WF-rehome-email",
    "Move an operator to a new email",
    "President, General Manager or IT Officer",
    "brian",
    ["/operate/admin/operators/{operator.brian}"],
    [],
    "Enter a replacement address and a reason; the old login is disabled and a verification link goes to the new address.",
  ),
  wf(
    M1,
    "WF-audit-evidence",
    "Read the audit evidence",
    "System, read by an administrator",
    "clint",
    ["/operate/admin/operators/{operator.brian}", "/operate/admin/roles/{role.kit_manager}"],
    ["audit.row"],
    "Operator audit history on the operator, Holder history on the role — actor, timestamp, reason, before and after.",
  ),
  wf(
    M1,
    "WF-role-management-authority",
    "Be refused where authority is missing",
    "Any operator without role management",
    "coach",
    ["/operate/admin/operators", "/operate/roster", "/operate/report"],
    ["seat.held"],
    "The coach seat is refused administration, the roster and the report, and is shown only the attendance surfaces.",
  ),
  wf(
    M1,
    "WF-onboard-coach",
    "Seat a coach",
    "President, General Manager or IT Officer",
    "brian",
    ["/operate/admin/operators/new", "/operate/admin/roles"],
    ["seat.held"],
    "A coaching role can be added to an existing player Person without touching their membership; a fixed coach gets attendance and availability only.",
  ),

  // M2 — events and calendar
  wf(
    M2,
    "W1",
    "Find and read events",
    "Anyone, with or without an account",
    "stewart",
    [
      "/operate/events",
      "/operate/events/calendar",
      "/calendar",
      "/calendar/view",
      "/calendar/{event.approved.late}",
    ],
    [
      "event.approved.upcoming",
      "event.term-card",
      "event.draft.audience-confirmed",
      "event.cancelled.not-held",
      "event.online",
    ],
    "The operator list with every state; both calendars; the public page showing only public details and no operator controls.",
  ),
  wf(
    M2,
    "W2",
    "Subscribe to the club calendar",
    "Anyone with a calendar app",
    "clint",
    ["/calendar", "/calendar/feed.ics"],
    ["event.approved.upcoming"],
    "Add to your calendar opens a dialog with Google, Apple, Outlook and copy; the feed carries the approved events.",
  ),
  wf(
    M2,
    "W3",
    "Load and correct a term's events by import",
    "Secretary, or event management",
    "stewart",
    ["/operate/events/import", "/operate/events/import/export"],
    ["event.term-card", "audit.import"],
    "The import screen with its prompt and template; the export round-trips the term card already loaded, every row a draft.",
  ),
  wf(
    M2,
    "W4",
    "Draft an event and approve it with its audience",
    "Event management; approval by an approver",
    "clint",
    [
      "/operate/events/new",
      "/operate/events/{event.draft.audience-confirmed}",
      "/operate/events/{event.draft.no-audience}",
      "/operate/events/{event.game.draft}/edit",
    ],
    [
      "event.draft.audience-confirmed",
      "event.draft.no-audience",
      "event.questions",
      "event.alternative",
    ],
    "A draft with its audience arrives ready to approve; approving is refused on a draft with no audience; the transport questions and the alternative-slot group render.",
  ),
  wf(
    M2,
    "W5",
    "Amend or reschedule an approved event",
    "An approver",
    "stewart",
    [
      "/operate/events/{event.amended.notified}",
      "/operate/events/{event.amended.notified}/amend",
      "/operate/events/{event.amended.silent}",
    ],
    ["event.amended.notified", "event.amended.silent", "amendment.notified", "amendment.silent"],
    "The change history on the fixture that moved (everyone told) and on the session whose end time changed (nobody told); Amend offers save-and-notify.",
  ),
  wf(
    M2,
    "W6",
    "Cancel an event",
    "President, Vice-President, Secretary, General Manager",
    "clint",
    [
      "/operate/events/{event.cancelled.after-publication}",
      "/operate/events/{event.cancelled.not-held}",
      "/operate/events/{event.draft.audience-confirmed}/cancel",
    ],
    [
      "event.cancelled.after-publication",
      "event.cancelled.not-held",
      "job.cancellation-notice",
      "invitation.cancelled",
    ],
    "The cancelled Wednesday shows its reason and that everyone invited was told; the frozen Sunday reads as called off; Cancel on a draft asks for a reason.",
  ),
  wf(
    M2,
    "W7",
    "See who is coming, and who turned up",
    "An operator, and anyone holding the club link",
    "coach",
    [
      "/operate/events/{event.occurred.register}",
      "/operate/events/{event.occurred.register}/attendance",
      "/e/{link.club.extra:film-review}",
      "/e/{link.club.game:home-1}",
    ],
    [
      "event.occurred.register",
      "attendance.walk-up",
      "attendance.said-no-attended",
      "attendance.said-yes-absent",
      "club-link.live",
      "club-link.revoked",
    ],
    "The participation table with answers beside presence; the register with walk-ups; the club link opens read-only with no operator controls and the revoked one does not.",
  ),
  wf(
    M2,
    "W8",
    "Administer event-type templates",
    "Event management",
    "brian",
    ["/operate/events/templates", "/operate/events/templates/{type.practice}"],
    ["event.type.practice"],
    "One template per type; saving changes every unapproved draft of that type and nothing else.",
  ),

  // M4 — messaging
  wf(
    M4,
    "W1",
    "Approve an event knowing what it will send",
    "An approver",
    "clint",
    ["/operate/events/{event.draft.audience-confirmed}", "/operate/events/{event.approved.late}"],
    ["event.draft.audience-confirmed", "plan.frozen", "plan.late-approval", "job.failed.no-route"],
    "Before approving, the plan says how many will be messaged, when each rung goes, and who cannot be reached; the short-notice event is labelled as compressed.",
  ),
  wf(
    M4,
    "W2",
    "Answer an invitation",
    "The invited player",
    "brian",
    ["/rsvp/{link.rsvp.brian}", "/rsvp/{link.rsvp.expired}", "/me/{link.me.brian}"],
    ["token.rsvp.live", "token.rsvp.expired", "token.durable.live"],
    "Your own live link answers and lands on the saved page; an expired link shows the dead-link page; your player page lists your invitations.",
  ),
  wf(
    M4,
    "W3",
    "Record an answer somebody gave you in person",
    "The operator who was told",
    "stewart",
    ["/operate/events/{event.approved.late}"],
    ["rsvp.recorded-in-person", "event.approved.partial-responses"],
    "Record an answer on a silent row; the row then names who recorded it and when.",
  ),
  wf(
    M4,
    "W4",
    "See who is coming, and who has not answered",
    "Any operator",
    "stewart",
    ["/operate/events/{event.approved.late}", "/operate/events/{event.occurred.register}"],
    [
      "event.approved.partial-responses",
      "invitation.expired",
      "job.reminder",
      "job.email-rung",
      "job.cancelled.answered",
    ],
    "The Delivery column reads sent, reminded or emailed per person, never Nothing queued; a chase position per silent invitee.",
  ),
  wf(
    M4,
    "W5",
    "Chase the people who have not answered",
    "The President, and any operator working follow-ups",
    "clint",
    ["/operate/admin/follow-ups", "/operate/events/{event.amended.notified}"],
    ["flag.raised", "flag.resolved", "job.escalation"],
    "The cross-event queue lists every silent invitee past threshold; the fixture shows the escalation went to the President and which flags a human resolved.",
  ),
  wf(
    M4,
    "W6",
    "Repair a delivery that failed",
    "An operator triaging delivery",
    "brian",
    [
      "/operate/events/{event.job.failed.terminal}/delivery",
      "/operate/events/{event.job.failed.whatsapp}/delivery",
      "/operate/events/{event.job.failed.no-route}/delivery",
    ],
    [
      "job.failed.terminal",
      "job.failed.whatsapp",
      "job.email-fallback",
      "job.failed.no-route",
      "delivery.rejected",
      "delivery.manual",
      "delivery.attempt.failed",
    ],
    "Failed with a reason and a Retry; a WhatsApp failure carried by email; Not dispatched — no channel with a roster fix rather than a button; the diagnostics page lists every attempt.",
  ),
  wf(
    M4,
    "W7",
    "Find out what the club's messaging rules are, and change them",
    "Any operator reading; Brian changing",
    "brian",
    ["/operate/admin/messaging"],
    ["plan.frozen"],
    "The schedule per event type reads as the club's rules; a change applies only to events approved afterwards.",
  ),
  wf(
    M4,
    "W8",
    "Keep queued messages honest when an event changes",
    "Nobody — a consequence",
    "stewart",
    ["/operate/events/{event.held}", "/operate/events/{event.held}/delivery"],
    ["event.held", "job.held", "job.schedule-change-notice"],
    "The Film Review's remaining reminders read Held with the reason; the change notice was sent; nothing about the old venue can go out.",
  ),

  // M5 — people and roster
  wf(
    M5,
    "W1",
    "Look up any person the club holds",
    "Four-role operator",
    "stewart",
    [
      "/operate/people",
      "/operate/people/{person.player.first}",
      "/operate/people/{person.past-member}",
      "/operate/people/{person.under-18}",
    ],
    [
      "person.player",
      "person.alias.display",
      "person.first-name-only",
      "person.past-member",
      "person.under-18",
      "person.recruit",
      "person.staff-only",
    ],
    "Search by alias finds Al; the record shows the thirteen facts, aliases, standing, seats, and the under-18 flag; widening shows last season's people.",
  ),
  wf(
    M5,
    "W2",
    "Correct a person's record",
    "Four-role operator",
    "clint",
    ["/operate/people/{person.player.first}/edit", "/operate/people/{person.contact-superseded}"],
    [
      "contact.superseded",
      "audit.person-corrected",
      "contact.phone.malformed",
      "contact.email.malformed",
    ],
    "Replacing a number keeps the old one dated; changing a filled value asks for a reason and lands on the history; malformed values are flagged before save.",
  ),
  wf(
    M5,
    "W3",
    "Add or link a person who holds no membership",
    "Four-role operator",
    "stewart",
    ["/operate/people/new"],
    ["person.near-duplicate"],
    "Entering the near-duplicate's number surfaces the existing person; link, create, or stop.",
  ),
  wf(
    M5,
    "W4",
    "Merge two records for the same human",
    "Four-role operator",
    "clint",
    ["/operate/people/{person.near-duplicate}/merge", "/operate/people/{person.merged}"],
    ["person.near-duplicate", "person.merged", "audit.person-merged"],
    "Side by side, differing fields marked, a reason required; the already-merged record reads as merged and points at its survivor.",
  ),
  wf(
    M5,
    "W5",
    "Work this season's roster",
    "Four-role operator",
    "stewart",
    ["/operate/roster"],
    [
      "membership.active",
      "membership.inactive",
      "membership.onboarding",
      "membership.departed",
      "availability.orange",
      "availability.red",
      "jersey.assigned",
      "position.assigned",
      "eligibility.recorded",
      "blues.awarded",
      "person.missing-required",
    ],
    "Every column banded Person · Onboarding · Season; filter by standing; edit a cell and see it commit; the Missing count links to the queue.",
  ),
  wf(
    M5,
    "W6",
    "Open one player's record",
    "Four-role operator",
    "clint",
    [
      "/operate/roster/{membership.active}",
      "/operate/roster/{membership.inactive}",
      "/operate/roster/{membership.departed}",
    ],
    [
      "membership.status-event",
      "availability.green",
      "membership.entry.returning",
      "onboarding.membership.active-with-outstanding",
    ],
    "The ladder with dated milestones, the full status history, positions, jersey, availability, eligibility, formalwear, Blues, and this season's RSVP and attendance history.",
  ),
  wf(
    M5,
    "W7",
    "Work the missing-data queue",
    "Four-role operator",
    "stewart",
    ["/operate/people/missing"],
    ["person.missing-required"],
    "Each row names the facts absent; filter by which fact; go to correction and come back.",
  ),

  // M6 — recruitment
  wf(
    M6,
    "W1",
    "The recruit board",
    "Core-four operator",
    "clint",
    ["/operate/recruitment"],
    [
      "prospect.identified",
      "prospect.engaged",
      "prospect.committed",
      "prospect.joined",
      "prospect.declined",
      "prospect.disengaged",
      "prospect.void",
      "consent.granted",
      "consent.refused",
      "job.recruit-cycle.welcome",
      "invitation.recruit",
    ],
    "Every recruit as one line; filter by status, consent and questionnaire sent; a pair of columns per recruitment event; change a status in the cell.",
  ),
  wf(
    M6,
    "W2",
    "One recruit's record",
    "Core-four operator",
    "stewart",
    ["/operate/recruitment/{prospect.engaged}", "/operate/recruitment/{prospect.committed}"],
    ["prospect.note", "questionnaire.answered", "prospect.status-event", "token.interest.spent"],
    "Both questionnaires and the answers; every recruitment event with RSVP and attendance; a dated note; the send dialog with last-sent dates; the status history.",
  ),
  wf(
    M6,
    "W3",
    "Removed — not a workflow",
    "None",
    null,
    [],
    [],
    "Nothing is built here. The number is kept and never reused.",
    { notAWorkflow: true },
  ),
  wf(
    M6,
    "W4",
    "Fill in your details",
    "The recruit",
    "brian",
    ["/a/{link.interest.spent}"],
    ["token.interest.spent", "questionnaire.answered"],
    "A spent link shows the already-answered page; nothing further can be submitted through it.",
  ),
  wf(
    M6,
    "W5",
    "Capture a walk-up as a recruit",
    "Whoever is taking attendance",
    "coach",
    ["/operate/events/{event.recruitment.occurred}/attendance"],
    ["prospect.walk-up", "attendance.recruit"],
    "Add a walk-up from the sheet: name and number, read back, duplicate check, saved as present and on the board.",
  ),
  wf(
    M6,
    "W6",
    "Add a recruit by hand",
    "Core-four operator",
    "stewart",
    ["/operate/recruitment/new"],
    ["prospect.possible-duplicate"],
    "Enter a name and the near-duplicate's number; the check offers the existing person; record how the club came by the number.",
  ),
  wf(
    M6,
    "W7",
    "Sign yourself in",
    "The recruit",
    "brian",
    ["/join/{link.join.live}", "/operate/recruitment/qr"],
    ["signup-code.live", "signup-code.retired", "consent.granted"],
    "The public form on the club's own page; consent is required to submit; you are told if you are already in the list; the QR page shows the live code.",
  ),
  wf(
    M6,
    "W8",
    "Resolve a possible duplicate",
    "Core-four operator",
    "stewart",
    ["/operate/recruitment/new", "/operate/recruitment/{prospect.possible-duplicate}"],
    ["prospect.possible-duplicate", "person.near-duplicate"],
    "The candidate says who it is; link or create; an exact match refuses a create without a reason.",
  ),
  wf(
    M6,
    "W9",
    "Folded — not a workflow",
    "None",
    null,
    [],
    [],
    "Nothing is built here. The number is kept and never reused.",
    { notAWorkflow: true },
  ),
  wf(
    M6,
    "W10",
    "Administer recruitment's messages, cycles and QR",
    "Core-four operator",
    "brian",
    ["/operate/admin/messaging", "/operate/recruitment/qr"],
    ["signup-code.live", "job.recruit-cycle.welcome"],
    "The Recruitment section: the cycle's timings; the Recruitment event row's two audiences; the QR minted, named and revocable.",
  ),
  wf(
    M6,
    "W11",
    "Run a recruitment event",
    "Core-four operator",
    "clint",
    ["/operate/events/{event.recruitment.draft}", "/operate/events/{event.recruitment.occurred}"],
    [
      "event.draft.audience-confirmed",
      "event.type.recruitment",
      "invitation.recruit",
      "job.recruit-follow-up",
      "job.failed.no-consent",
    ],
    "The draft's plan is grouped by audience — players' ladder and recruits' one follow-up; the taster shows recruits invited, answered and present.",
  ),
  wf(
    M6,
    "W12",
    "Take attendance at a recruitment event",
    "An operator or a coach",
    "coach",
    ["/operate/events/{event.recruitment.occurred}/attendance"],
    ["attendance.recruit", "attendance.walk-up"],
    "Recruits as their own group at the top; a walk-up captured without leaving the sheet; turnout as the sum of records.",
  ),
  wf(
    M6,
    "W13",
    "Take a recruit off the board",
    "Core-four operator",
    "clint",
    ["/operate/recruitment/{prospect.disengaged}", "/operate/recruitment/{prospect.void}"],
    ["prospect.declined", "prospect.disengaged", "prospect.void"],
    "Change to an exit value in the cell; void demands a reason; the disengaged one can come back.",
  ),
  wf(
    M6,
    "W14",
    "Flip a recruit to joined",
    "President, Vice-President, Secretary or General Manager",
    "clint",
    [
      "/operate/recruitment/{prospect.committed}",
      "/operate/recruitment/{prospect.joined}",
      "/operate/roster/{membership.from-recruit}",
    ],
    ["prospect.joined", "membership.from-recruit"],
    "Setting joined interrupts with what it will create; the already-flipped recruit links to a membership at onboarding with a checklist and a welcome sent.",
  ),

  // M7 — onboarding
  wf(
    M7,
    "W1",
    "Bring last season's squad in",
    "Four-role operator",
    "stewart",
    ["/operate/roster/import"],
    ["person.past-member", "membership.imported"],
    "The import names the season, refuses a bad file whole, proposes New / Carried forward / Unchanged / Refused per row, and queues one welcome each.",
    { arrivesWith: "LAN-215" },
  ),
  wf(
    M7,
    "W2",
    "Add one player by hand",
    "Any linked operator",
    "stewart",
    ["/operate/roster/new"],
    ["membership.added-by-hand"],
    "First name, last name and mobile required; the duplicate check runs; the record shows the generated checklist and the welcome queued.",
    { arrivesWith: "LAN-215" },
  ),
  wf(
    M7,
    "W3",
    "A flipped recruit lands in onboarding",
    "Consequence of the flip",
    "clint",
    ["/operate/roster/{membership.from-recruit}"],
    ["membership.from-recruit", "job.onboarding-welcome", "onboarding.item.pending"],
    "The flipped recruit's membership at onboarding, the full checklist generated, consent carried, the welcome sent, the recruit link retired.",
  ),
  wf(
    M7,
    "W4",
    "Say yes and fill in your details",
    "The player",
    "brian",
    ["/me/{link.me.brian}"],
    ["token.durable.live", "token.onboarding.live", "onboarding.ask.submitted"],
    "Your own link opens the five-step questionnaire with values pre-filled; consent is the first field; BUCS and Hudl record claimed.",
    { arrivesWith: "LAN-216" },
  ),
  wf(
    M7,
    "W5",
    "Fix something the club has wrong",
    "The player",
    "brian",
    ["/me/{link.me.brian}"],
    ["dispute.open"],
    "Returning through the same link shows everything held; changing an operator-recorded value raises a dispute rather than overwriting.",
    { arrivesWith: "LAN-216" },
  ),
  wf(
    M7,
    "W6",
    "One player's onboarding record",
    "Four-role operator",
    "clint",
    [
      "/operate/roster/{onboarding.membership.outstanding}",
      "/operate/roster/{onboarding.membership.ready}",
      "/operate/roster/{onboarding.membership.active-with-outstanding}",
    ],
    [
      "onboarding.item.pending",
      "onboarding.item.invited",
      "onboarding.item.claimed",
      "onboarding.item.complete",
      "onboarding.item.waived",
      "onboarding.item.not_applicable",
      "onboarding.history.claimed",
      "onboarding.log.ask",
      "onboarding.log.answer",
      "onboarding.agreement.code_of_conduct",
    ],
    "Every item with its state and who set it; an item's full history; complete, waive (no reason), not applicable, reopen; the activity log grouped by section.",
  ),
  wf(
    M7,
    "W7",
    "Settle a disputed fact",
    "Four-role operator",
    "clint",
    ["/operate/people/{person.disputed}"],
    ["dispute.open", "dispute.resolved"],
    "Both values with both attributions; keep the club's or take the player's; the losing value retained.",
  ),
  wf(
    M7,
    "W8",
    "Work the queue and nudge",
    "Four-role operator",
    "stewart",
    ["/operate/people/missing"],
    ["onboarding.membership.outstanding", "onboarding.nudge.sent"],
    "Sorted by how much is outstanding, with last contact and next automated contact per person; select several and nudge.",
    { arrivesWith: "LAN-218" },
  ),
  wf(
    M7,
    "W9",
    "Pick up a chase that ran out",
    "The configured office — initially the President",
    "clint",
    ["/operate/people/missing"],
    ["onboarding.chase.exhausted", "onboarding.escalation.sent"],
    "A message with a count and a link; the exhausted people listed with what each is missing; the human's own contact recorded on the log.",
    { arrivesWith: "LAN-218" },
  ),
  wf(
    M7,
    "W10",
    "Activate a player",
    "Four-role operator",
    "clint",
    ["/operate/roster/{onboarding.membership.ready}"],
    ["onboarding.membership.ready", "membership.status-event"],
    "Set Status to Active on the ready player; nothing requires the checklist first; the status history records the flip.",
  ),
  wf(
    M7,
    "W11",
    "Set onboarding's chase",
    "Four-role operator",
    "brian",
    ["/operate/admin/messaging"],
    [],
    "The Onboarding section: how many times, how often, and the first delay; the escalation office read from the roles.",
    { arrivesWith: "LAN-218" },
  ),
]);

// ---------------------------------------------------------------------------
// Reading the intake ledgers, for the rendered map
// ---------------------------------------------------------------------------

function section(markdown, heading) {
  const match = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(
    markdown,
  );
  return match ? match[1].trim() : null;
}

function bullet(markdown, label) {
  const match = new RegExp(`^\\s*[-*]\\s*\\*\\*${label}[^*]*\\*\\*:?\\s*(.*)$`, "m").exec(markdown);
  return match ? match[1].trim() : null;
}

/** What the intake ledgers and packets say about each workflow, keyed by map id. */
export function readIntake(repoRoot = REPO_ROOT) {
  const out = new Map();
  for (const mission of MISSIONS) {
    const packetPath = path.join(repoRoot, "missions/packets", mission.id, "packet.json");
    const packet = existsSync(packetPath) ? JSON.parse(readFileSync(packetPath, "utf8")) : null;
    const matrix = new Map((packet?.workflow_matrix ?? []).map((entry) => [entry.id, entry]));
    const intakeRoot = path.join(repoRoot, "missions/intake", mission.id);
    const workflowDir = path.join(intakeRoot, "workflows");
    const mockupDir = path.join(intakeRoot, "mockups");
    const files = existsSync(workflowDir) ? readdirSync(workflowDir) : [];
    const shots = existsSync(path.join(mockupDir, "shots"))
      ? readdirSync(path.join(mockupDir, "shots"))
      : [];
    const pages = existsSync(mockupDir)
      ? readdirSync(mockupDir).filter((file) => file.endsWith(".html") && file !== "index.html")
      : [];

    for (const workflow of WORKFLOWS.filter((entry) => entry.mission === mission.id)) {
      const id = workflow.workflow;
      const entry = matrix.get(id) ?? {};
      const file = files.find((name) => new RegExp(`^${id}-.*\\.md$`).test(name));
      const markdown = file ? readFileSync(path.join(workflowDir, file), "utf8") : "";
      const page = pages.find((name) => new RegExp(`^${id}([-.]|$)`).test(name)) ?? null;
      out.set(workflow.id, {
        file: file ? path.posix.join("missions/intake", mission.id, "workflows", file) : null,
        primaryActor: bullet(markdown, "Primary actor") ?? entry.actor ?? null,
        placement:
          bullet(markdown, "Route/placement") ??
          bullet(markdown, "Placement") ??
          entry.placement ??
          null,
        trigger: bullet(markdown, "Trigger") ?? entry.trigger ?? null,
        result: bullet(markdown, "User-visible result") ?? entry.user_visible_result ?? null,
        requiredActions: section(markdown, "Required actions"),
        stateTransitions:
          section(markdown, "State transitions") ??
          ((entry.state_transitions ?? []).map((line) => `- ${line}`).join("\n") || null),
        packetActions: entry.actions ?? [],
        mockupPage: page ? path.posix.join("missions/intake", mission.id, "mockups", page) : null,
        // The ledger's own screenshots: `shots/W5-01-proposed-desktop.png` in
        // the three missions that shot proposals, `W3-01-desktop.jpg` at the
        // mockups root in the messaging mission. Proposed over current, both
        // widths, in shot order.
        shots: [
          ...shots
            .filter((name) =>
              new RegExp(`^${id}-\\d+-proposed-(desktop|phone375)\\.png$`).test(name),
            )
            .map((name) =>
              path.posix.join("missions/intake", mission.id, "mockups", "shots", name),
            ),
          ...(existsSync(mockupDir) ? readdirSync(mockupDir) : [])
            .filter((name) => new RegExp(`^${id}-\\d+-(desktop|375)\\.(jpg|png)$`).test(name))
            .map((name) => path.posix.join("missions/intake", mission.id, "mockups", name)),
        ].sort(),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolving routes
// ---------------------------------------------------------------------------

/** Fills `{example.key}` placeholders from the plan's examples; unresolved ones are returned as-is. */
export function resolveRoute(template, examples) {
  const missing = [];
  const route = template.replace(/\{([^}]+)\}/g, (whole, key) => {
    const value = examples?.get(key);
    if (value === undefined) {
      missing.push(key);
      return whole;
    }
    return value;
  });
  return { route, missing };
}

/** The `src/app` page pattern a template corresponds to, for the coverage test. */
export function routePattern(template) {
  return template
    .replace(/\{(link\.[^}]+)\}/g, "[token]")
    .replace(/\{link\.join\.[^}]+\}/g, "[code]")
    .replace(/\{[^}]+\}/g, (match) => {
      if (
        match.startsWith("{person.") ||
        match.startsWith("{dispute.") ||
        match.startsWith("{contact.")
      )
        return "[personId]";
      if (match.startsWith("{prospect.")) return "[prospectId]";
      if (match.startsWith("{membership.") || match.startsWith("{onboarding.membership."))
        return "[membershipId]";
      if (match.startsWith("{event.")) return "[id]";
      if (match.startsWith("{role.")) return "[roleId]";
      if (match.startsWith("{type.")) return "[type]";
      if (match.startsWith("{operator.")) return "[operatorId]";
      return "[id]";
    })
    .replace("/join/[token]", "/join/[code]");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function missionOf(id) {
  return MISSIONS.find((mission) => mission.id === id);
}

export function renderMarkdown() {
  const lines = [];
  lines.push("# Tester week — the workflow map");
  lines.push("");
  lines.push(
    "Generated from `scripts/production/showcase/map.mjs`; do not edit by hand. One row per workflow across the six missions: the routes it touches, who performs it, which tester gets it, and the data states that have to exist for it to be visible and exercisable. `showcase verify` proves every state exists in the loaded target; `showcase checklists` writes the links.",
  );
  lines.push("");
  lines.push(
    `Workflows: ${WORKFLOWS.length} (${WORKFLOWS.filter((w) => w.notAWorkflow).length} kept as empty slots). States: ${STATES.length} (${STATES.filter((s) => s.arrivesWith).length} arriving with later packages).`,
  );
  lines.push("");
  lines.push(
    "| Mission | ID | Workflow | Routes | Performed by | Tester | Data states needed | Arrives with |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const workflow of WORKFLOWS) {
    const mission = missionOf(workflow.mission);
    lines.push(
      `| ${mission.short} ${mission.title} | ${workflow.workflow} | ${workflow.name} | ${workflow.routes.map((route) => `\`${route}\``).join("<br>") || "—"} | ${workflow.actor} | ${workflow.tester ? TESTERS[workflow.tester].name : "—"} | ${workflow.states.map((state) => `\`${state}\``).join(" ") || "—"} | ${workflow.arrivesWith ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## States");
  lines.push("");
  lines.push("| State | Means | Table | Floor | Arrives with |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const state of STATES) {
    lines.push(
      `| \`${state.key}\` | ${state.label} | ${state.table ? `\`${state.table.replace("public.", "")}\`` : "—"} | ${state.arrivesWith ? "—" : state.min} | ${state.arrivesWith ?? ""} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** A tiny markdown-to-HTML renderer for the intake prose: paragraphs, lists, tables, inline code and strong. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\s)_([^_\n]+)_/g, "$1<em>$2</em>");
}

function renderProse(markdown) {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    if (line.includes("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? "")) {
      const split = (row) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim());
      const head = split(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "")
        body.push(split(lines[i++]));
      out.push(
        `<div class="tablewrap"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (
        i < lines.length &&
        (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || /^\s+\S/.test(lines[i]))
      ) {
        const match = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (match) items.push(match[2]);
        else if (items.length > 0) items[items.length - 1] += ` ${lines[i].trim()}`;
        i += 1;
      }
      out.push(
        `<${ordered ? "ol" : "ul"}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`,
      );
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !(lines[i].includes("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? ""))
    )
      para.push(lines[i++]);
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

const STYLE = `<style>
  :root { --primary: #0b3d91; --text: rgba(0,0,0,0.87); --sec: rgba(0,0,0,0.6); --divider: rgba(0,0,0,0.12); --grey50: #fafafa; --grey100: #f5f5f5; --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--font); color: var(--text); background: #e7e9ee; line-height: 1.6; }
  .bar { position: sticky; top: 0; z-index: 5; background: #212121; color: #fff; padding: 11px 22px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
  .bar .who { font-weight: 700; font-size: 0.95rem; } .bar .who span { color: #bdbdbd; font-weight: 400; margin-left: 8px; font-size: 0.8rem; }
  .bar a { color: #fff; text-decoration: none; font-size: 0.85rem; border: 1px solid rgba(255,255,255,0.35); border-radius: 6px; padding: 4px 10px; margin-left: 8px; }
  .layout { display: flex; gap: 26px; max-width: 1280px; margin: 26px auto 90px; padding: 0 22px; align-items: flex-start; }
  nav.toc { position: sticky; top: 68px; flex: 0 0 300px; background: #fff; border: 1px solid var(--divider); border-radius: 10px; padding: 16px 8px 16px 16px; max-height: calc(100vh - 104px); overflow: auto; }
  nav.toc h2 { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sec); margin: 12px 0 6px; border: 0; padding: 0; }
  nav.toc ol { list-style: none; margin: 0; padding: 0; } nav.toc a { display: block; color: var(--text); text-decoration: none; font-size: 13px; padding: 3px 8px; border-radius: 5px; } nav.toc a:hover { background: var(--grey100); }
  main { flex: 1 1 auto; min-width: 0; }
  section.doc { background: #fff; border: 1px solid var(--divider); border-radius: 10px; padding: 4px 30px 26px; margin-bottom: 22px; }
  section.doc > header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 0 11px; border-bottom: 1px solid var(--divider); }
  section.doc > header h2 { font-size: 1.05rem; margin: 0; }
  h1 { font-size: 1.45rem; margin: 22px 0 10px; } h2.mission { font-size: 1.2rem; margin: 34px 0 10px; } h3 { font-size: 0.95rem; margin: 18px 0 6px; color: var(--sec); text-transform: uppercase; letter-spacing: 0.04em; }
  p, li { font-size: 0.93rem; } ul, ol { padding-left: 22px; } li { margin: 4px 0; }
  code { background: var(--grey100); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
  .tablewrap { overflow-x: auto; margin: 12px 0; } table { border-collapse: collapse; width: 100%; font-size: 0.86rem; } th, td { border: 1px solid var(--divider); padding: 7px 9px; text-align: left; vertical-align: top; } thead th { background: var(--grey50); font-size: 0.76rem; letter-spacing: 0.03em; text-transform: uppercase; color: var(--sec); }
  a { color: var(--primary); }
  .chip { display: inline-block; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; padding: 2px 9px; border-radius: 11px; white-space: nowrap; }
  .chip.ok { background: #edf7ed; color: #1b5e20; } .chip.warn { background: #fff4e5; color: #663c00; } .chip.idle { background: var(--grey100); color: var(--sec); } .chip.tester { background: #e8eefc; color: #0b3d91; }
  .state { display: inline-block; margin: 2px 6px 2px 0; padding: 2px 8px; border: 1px solid var(--divider); border-radius: 6px; font-size: 0.8rem; background: var(--grey50); } .state.later { border-style: dashed; color: var(--sec); }
  .shots { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; } .shots a { display: block; } .shots img { max-width: 320px; max-height: 240px; border: 1px solid var(--divider); border-radius: 6px; background: #fff; }
  .routes li code { font-size: 0.9em; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 14px 0 22px; }
  .summary div { background: #fff; border: 1px solid var(--divider); border-radius: 10px; padding: 12px 16px; } .summary b { display: block; font-size: 1.4rem; }
  @media (max-width: 900px) { .layout { display: block; padding: 0 12px; } nav.toc { position: static; margin-bottom: 18px; max-height: none; } section.doc { padding: 4px 16px 22px; } }
</style>`;

/**
 * The browsable map: an index by mission, one section per workflow with its
 * purpose, actor, tester, routes (linked when `baseUrl` and `examples` are
 * supplied), the required actions from the intake ledger, the states it
 * needs, and the ledger's screenshots.
 */
export function renderHtml({
  intake,
  examples = null,
  baseUrl = null,
  relativeTo = "docs/tester-week",
} = {}) {
  const rel = (repoPath) => path.posix.relative(relativeTo, repoPath);
  const link = (template) => {
    if (!examples || !baseUrl) return `<code>${esc(template)}</code>`;
    const { route, missing } = resolveRoute(template, examples);
    if (missing.length > 0)
      return `<code>${esc(template)}</code> <span class="chip idle">no example for ${esc(missing.join(", "))}</span>`;
    return `<a href="${esc(baseUrl + route)}"><code>${esc(route)}</code></a>`;
  };
  const stateChip = (key) => {
    const state = STATE_BY_KEY.get(key);
    if (!state) return `<span class="state" title="unknown state">${esc(key)}</span>`;
    return `<span class="state${state.arrivesWith ? " later" : ""}" title="${esc(state.label)}${state.arrivesWith ? ` — arrives with ${esc(state.arrivesWith)}` : ` — floor ${state.min}`}">${esc(key)}</span>`;
  };

  const counts = {
    workflows: WORKFLOWS.filter((w) => !w.notAWorkflow).length,
    later: WORKFLOWS.filter((w) => w.arrivesWith).length,
    states: STATES.filter((s) => !s.arrivesWith).length,
    laterStates: STATES.filter((s) => s.arrivesWith).length,
  };
  const byTester = Object.fromEntries(
    Object.keys(TESTERS).map((key) => [key, WORKFLOWS.filter((w) => w.tester === key).length]),
  );

  const sections = MISSIONS.map((mission) => {
    const workflows = WORKFLOWS.filter((w) => w.mission === mission.id);
    return `<h2 class="mission" id="${esc(mission.id)}">${esc(mission.short)} — ${esc(mission.title)}</h2>
${workflows
  .map((workflow) => {
    const detail = intake.get(workflow.id) ?? {};
    const chip = workflow.notAWorkflow
      ? '<span class="chip idle">not a workflow</span>'
      : workflow.arrivesWith
        ? `<span class="chip warn">arrives with ${esc(workflow.arrivesWith)}</span>`
        : '<span class="chip ok">on main</span>';
    const tester = workflow.tester
      ? `<span class="chip tester">${esc(TESTERS[workflow.tester].name)} · ${esc(TESTERS[workflow.tester].role)}</span>`
      : "";
    const actions = detail.requiredActions
      ? renderProse(detail.requiredActions)
      : detail.packetActions?.length
        ? `<ul>${detail.packetActions.map((action) => `<li>${inline(action)}</li>`).join("")}</ul>`
        : "<p><em>No required-actions section in the ledger.</em></p>";
    const shots = detail.shots?.length
      ? `<div class="shots">${detail.shots.map((shot) => `<a href="${esc(rel(shot))}"><img loading="lazy" src="${esc(rel(shot))}" alt="${esc(path.basename(shot))}" /></a>`).join("")}</div>`
      : detail.mockupPage
        ? `<p><a href="${esc(rel(detail.mockupPage))}">Screens in the intake ledger</a></p>`
        : "<p><em>No screenshots in the ledger for this workflow.</em></p>";
    return `<section class="doc" id="${esc(workflow.id)}">
  <header><h2>${esc(workflow.workflow)} — ${esc(workflow.name)}</h2>${chip}${tester}</header>
  ${detail.result ? `<p><strong>Outcome.</strong> ${inline(detail.result)}</p>` : ""}
  <p><strong>Performed by.</strong> ${inline(detail.primaryActor ?? workflow.actor)}</p>
  ${detail.trigger ? `<p><strong>Trigger.</strong> ${inline(detail.trigger)}</p>` : ""}
  <h3>Routes</h3>
  ${workflow.routes.length ? `<ul class="routes">${workflow.routes.map((route) => `<li>${link(route)}</li>`).join("")}</ul>` : "<p><em>No route of its own.</em></p>"}
  ${detail.placement ? `<p class="placement"><em>${inline(detail.placement)}</em></p>` : ""}
  <h3>What the tester should see</h3>
  <p>${inline(workflow.expect)}</p>
  <h3>Actions on the page</h3>
  ${actions}
  ${detail.stateTransitions ? `<h3>State transitions</h3>${renderProse(detail.stateTransitions)}` : ""}
  <h3>Data states it needs</h3>
  <p>${workflow.states.length ? workflow.states.map(stateChip).join(" ") : "<em>None — read-only over whatever exists.</em>"}</p>
  <h3>Screens</h3>
  ${shots}
  ${detail.file ? `<p><a href="${esc(rel(detail.file))}">Specification in the intake ledger</a></p>` : ""}
</section>`;
  })
  .join("\n")}`;
  }).join("\n");

  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tester week · workflow map</title>
    ${STYLE}
  </head>
  <body>
    <div class="bar">
      <div class="who">Tester week — the workflow map<span>LAN-221 · generated from scripts/production/showcase/map.mjs</span></div>
      <div><a href="workflow-map.md">Table</a>${baseUrl ? `<a href="${esc(baseUrl)}">${esc(baseUrl)}</a>` : ""}</div>
    </div>
    <div class="layout">
      <nav class="toc">
        <h2>Missions</h2>
        <ol>${MISSIONS.map(
          (mission) =>
            `<li><a href="#${esc(mission.id)}">${esc(mission.short)} — ${esc(mission.title)}</a><ol>${WORKFLOWS.filter(
              (w) => w.mission === mission.id,
            )
              .map((w) => `<li><a href="#${esc(w.id)}">${esc(w.workflow)} ${esc(w.name)}</a></li>`)
              .join("")}</ol></li>`,
        ).join("")}</ol>
      </nav>
      <main>
        <h1>Every workflow, its routes, who tests it, and the data it needs</h1>
        <div class="summary">
          <div><b>${counts.workflows}</b> workflows across six missions</div>
          <div><b>${counts.later}</b> arriving with Mission 7's remaining packages</div>
          <div><b>${counts.states}</b> data states the loader produces and verifies</div>
          <div><b>${counts.laterStates}</b> states that arrive later</div>
          ${Object.entries(byTester)
            .map(([key, n]) => `<div><b>${n}</b> for ${esc(TESTERS[key].name)}</div>`)
            .join("")}
        </div>
        ${sections}
      </main>
    </div>
  </body>
</html>
`;
}

/** Renders both artifacts, formatted the way `npm run format` would leave them. */
export async function renderArtifacts({
  repoRoot = REPO_ROOT,
  examples = null,
  baseUrl = null,
} = {}) {
  const intake = readIntake(repoRoot);
  return {
    [MAP_MARKDOWN]: await formatAs(renderMarkdown(), MAP_MARKDOWN),
    [MAP_HTML]: await formatAs(renderHtml({ intake, examples, baseUrl }), MAP_HTML),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const artifacts = await renderArtifacts();
  if (argv.includes("--write")) {
    for (const [file, content] of Object.entries(artifacts)) {
      const target = path.join(REPO_ROOT, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
      console.log(`wrote ${file}`);
    }
    return;
  }
  let drift = false;
  for (const [file, content] of Object.entries(artifacts)) {
    const target = path.join(REPO_ROOT, file);
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (current !== content) {
      drift = true;
      console.error(
        `${file} ${current === null ? "is missing" : "differs from the map"}; regenerate it with node scripts/production/showcase/map.mjs --write`,
      );
    }
  }
  if (drift) process.exitCode = 1;
  else console.log("The rendered map matches scripts/production/showcase/map.mjs.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
