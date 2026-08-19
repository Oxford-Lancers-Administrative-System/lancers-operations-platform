/**
 * The capability map: every privileged action in the First Operational Vertical
 * Slice, and the club role codes permitted to perform it.
 *
 * LAN-73. This module is deliberately the **only** place that answer exists.
 * No page, no server action and no service module carries its own inline list
 * of role codes; each one names a capability and reads it from here. Widening
 * or narrowing access is therefore a change to one file, reviewable on its own,
 * rather than an archaeology exercise across ten screens.
 *
 * Three properties this file is built to have:
 *
 *   * **It grants nothing implicitly.** A capability whose `roleCodes` is empty
 *     is refused to everybody, including the President. Absence of a decision
 *     is never permission. No entry is empty today: `role_management` was the
 *     last one, and Brian decided it on 15 August 2026.
 *
 *   * **It is data, not code.** No conditionals, no inheritance between
 *     capabilities, no "admin implies everything". An operator holding
 *     `head_coach` receives exactly the capabilities that list `head_coach`,
 *     which is what makes LAN-110's narrow attendance-recorder boundary
 *     checkable by reading twenty lines. `it_officer` holds every capability
 *     here, and it holds each one because it is written into that entry's list
 *     — not because an administrator rule grants it implicitly. Taking one
 *     action back off the seat stays a one-line edit to one array.
 *
 *   * **It is frozen at runtime.** `Object.freeze` on the map, on each entry
 *     and on each role list, so no later module can push a code onto a grant.
 *
 * ## Where the role codes come from
 *
 * `public.roles.code`. Since LAN-128 the catalogue is created by
 * `supabase/migrations/20260819090100_role_catalogue.sql` and by nothing else,
 * which closes the gap LAN-73's production handoff recorded: the catalogue used
 * to exist only in the local seed, so **hosted Supabase had no `roles` rows at
 * all** and every capability here keyed on codes that did not exist in
 * production. The migration reaches hosted and local alike — once Brian applies
 * it, which is his action and no agent's.
 * `tests/operator-capability-catalogue.test.ts` checks every code named here
 * against the real `public.roles` table, so a typo fails a test rather than
 * silently denying a legitimate operator forever.
 *
 * The catalogue that migration installs has twenty seats, and this map grants
 * capabilities to a subset of them. Seven of the ten coaching seats —
 * Quarterbacks, Offensive Line, Wide Receivers, Defensive Line, Linebackers,
 * Defensive Backs and Special Teams — hold **nothing** here: the approved
 * catalogue deliberately includes roles that carry no privileged capability
 * yet, and the coaching grant that reaches them is a separate, separately
 * reviewed decision. Nothing was widened by the catalogue growing.
 *
 * ## The grants, and who decided them
 *
 * | Capability                | Roles                                          | Decided by         |
 * | ------------------------- | ---------------------------------------------- | ------------------ |
 * | Attendance recorder       | `head_coach`, `offence_coach`, `defence_coach` | Brian, 12 Aug 2026 |
 * | Attendance recording      | the four calendar roles, plus those three seats | Lead, 14 Aug 2026  |
 * | Membership activation     | the four offices, plus `general_manager`       | Lead, 12 Aug 2026  |
 * | Event calendar management | President, VP, Secretary, General Manager      | Brian, 12 Aug 2026 |
 * | Event approval            | President, VP, Secretary, General Manager      | Brian, 12 Aug 2026 |
 * | Occurrence assertion      | President, VP, Secretary, General Manager      | Lead, 14 Aug 2026  |
 * | Delivery administration   | President, VP, Secretary, General Manager      | Lead, 13 Aug 2026  |
 * | Leadership report         | President, VP, Secretary, General Manager      | Lead, 14 Aug 2026  |
 * | Role management           | `it_officer` alone                             | Brian, 15 Aug 2026 |
 *
 * **Every capability above also lists `it_officer`.** Brian decided on 15
 * August 2026 (LAN-124) that the IT Officer is the club's administrative seat
 * and holds every privileged action in the slice. That is an administrative
 * grant rather than a demonstration affordance: `role_management` was held by
 * nobody at all. It is worth being exact about what that changed, because an
 * earlier version of this note was not: **no screen or service implements
 * operator management yet.** `manageRoles` is still `notImplemented`, so an IT
 * Officer holds the authority and not yet the ability, and accounts and role
 * assignments are still written to the database by hand. The seat is a real,
 * non-constitutional committee office in the catalogue migration, so holding it
 * is truthful.
 *
 * It is also the widest grant in the file, and worth narrowing later: whoever
 * holds `role_management` can assign themselves anything else. Brian recorded
 * that consequence when he took the decision.
 *
 * None of them is re-derived here, and none may be re-derived by a later
 * implementer: they are recorded owner and lead decisions on LAN-73, LAN-77,
 * LAN-78 and LAN-124.
 */

/** The privileged actions this slice knows about. */
export type CapabilityKey =
  | "attendance_recorder"
  | "membership_activation"
  | "event_calendar_management"
  | "event_approval"
  | "event_occurrence_assertion"
  | "attendance_recording"
  | "role_management"
  | "delivery_administration"
  | "leadership_report";

export interface Capability {
  readonly key: CapabilityKey;
  /** What the capability permits, in the club's language. Used in refusals. */
  readonly action: string;
  /**
   * `public.roles.code` for every role permitted to perform it.
   *
   * Empty means **nobody**, deliberately. It is not a placeholder for whoever
   * next touches this file — `decision` names the issue that owes the answer,
   * and that issue is where it gets made.
   */
  readonly roleCodes: readonly string[];
  /** Provenance: who decided this grant and when, or which issue still owes it. */
  readonly decision: string;
}

/**
 * Display labels for the role codes this map uses.
 *
 * Presentation text owned by this module, mirroring `roles.name` in the
 * catalogue migration. It exists so that a refusal can say "the President
 * role" rather than "the president role code", and it covers only the codes
 * named below — `describeRoles()` falls back to the raw code for anything
 * else, which is ugly on screen but never wrong.
 *
 * The club says "Offensive Coordinator" and "Defensive Coordinator" for the two
 * seats the catalogue calls `offence_coach` and `defence_coach`; Brian
 * confirmed on 12 August 2026 that these are those seats, and the approved
 * catalogue names them that way. The codes were left alone deliberately when
 * the names changed (LAN-128): a code is an identifier, and renaming it would
 * have rewritten every existing assignment's key for a cosmetic reason. The
 * previous names survive as `role_aliases` rows.
 */
const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  president: "President",
  vice_president: "Vice-President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  general_manager: "General Manager",
  it_officer: "IT Officer",
  head_coach: "Head Coach",
  offence_coach: "Offensive Coordinator",
  defence_coach: "Defensive Coordinator",
});

function capability(entry: Capability): Capability {
  return Object.freeze({ ...entry, roleCodes: Object.freeze([...entry.roleCodes]) });
}

export const CAPABILITIES: Readonly<Record<CapabilityKey, Capability>> = Object.freeze({
  /**
   * LAN-110's narrow attendance-recorder capability, and only that.
   *
   * This is *not* the general "an authorized operator records attendance" path
   * in `docs/ux/slice-ux.md` § 8 — that one resolves to "authorized operator",
   * not to role codes, and LAN-80 owns it. Gating general attendance on this
   * capability would lock out the Exec, which is why the two stay separate.
   *
   * It carries no roster editing, no activation, no approval, no role
   * management, no delivery, no report, no contact details and no availability
   * or injury data. That is proved by calling every other action with a coach
   * actor, not asserted here.
   */
  attendance_recorder: capability({
    key: "attendance_recorder",
    action: "record attendance for an occurred event",
    roleCodes: ["head_coach", "offence_coach", "defence_coach", "it_officer"],
    decision:
      "Brian, 12 August 2026 (LAN-108/LAN-110): the Head Coach, Offensive Coordinator " +
      "and Defensive Coordinator seats only. Assistant coaches do not hold them, and no " +
      "assistant role exists in the catalogue. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * Membership activation — "Exec/GM only" in the frozen model and in
   * `slice-ux.md` § 8.
   *
   * "Exec" is read as the executive committee: the four constitutional offices
   * (`is_constitutional_office` in the catalogue), plus the General Manager,
   * whom § 8 names explicitly. Recorded as a lead assumption on LAN-73 and
   * cheap to narrow — narrowing it is an edit to one array in this file.
   */
  membership_activation: capability({
    key: "membership_activation",
    action: "activate a season membership",
    roleCodes: [
      "president",
      "vice_president",
      "secretary",
      "treasurer",
      "general_manager",
      "it_officer",
    ],
    decision:
      "Lead, 12 August 2026: 'Exec' = the four constitutional offices, plus the General " +
      "Manager, whom slice-ux.md § 8 names for this transition. Stated as an assumption " +
      "on LAN-73. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * Managing the club calendar: creating, editing, submitting, withdrawing and
   * abandoning event drafts.
   *
   * Brian's LAN-76 clarification, 12 August 2026: "The club calendar is managed
   * only by these four operator roles — President, Vice President, Secretary,
   * General Manager." It is deliberately **not** every linked operator, which
   * is what LAN-76 assumed before the clarification and what a first
   * implementation shipped; and it is deliberately not inferred from being able
   * to reach another part of the application.
   *
   * Two things this capability is not:
   *
   *   * It is not *reading* the calendar. `/operate/events` stays an ordinary
   *     operator surface — `slice-ux.md` § 3 and § 8, and LAN-73's destination
   *     map, both make Events open to any linked active operator — so an
   *     operator without this capability sees the club's events and is refused
   *     every action on them. Hiding the list would be a change to an approved
   *     contract; refusing the actions is what the clarification asks for.
   *
   *   * It is not approval. The four calendar roles prepare an event and submit
   *     it for the pre-publication safety review; `event_approval` below is who
   *     performs that review, and that is still the President alone.
   *
   * There is no ownership term anywhere in it. A calendar operator may edit or
   * withdraw a draft another calendar operator created — the club calendar is
   * the club's, not its typist's, and the creator is recorded for audit rather
   * than for permission. That is the clarification's "do not describe the club
   * calendar or event as personally owned by its creator", made concrete.
   */
  event_calendar_management: capability({
    key: "event_calendar_management",
    action: "create, edit, submit or withdraw an event draft",
    roleCodes: ["president", "vice_president", "secretary", "general_manager", "it_officer"],
    decision:
      "Brian, 12 August 2026 (LAN-76 owner clarification): the club calendar is managed by " +
      "the President, Vice-President, Secretary and General Manager only. The Treasurer is " +
      "deliberately not included, and no coaching seat is. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * Event approval — the designated approver.
   *
   * This entry previously read `["president"]`, as a lead assumption that
   * recorded the gap and deferred it to LAN-77. LAN-77 is where Brian answered
   * it, and this is that answer: the same four calendar roles that may create,
   * edit and abandon an event may also approve one, and "for the MVP, any one
   * of those four authorized operators may approve an event they created."
   *
   * So approval and calendar management now carry the **same** role list, which
   * invites the obvious question of why they are still two capabilities. They
   * stay separate because they are two different decisions that merely agree
   * today: approval is the pre-invitation safety gate and is the only action in
   * the slice that releases automated messages to real people. Separation of
   * duties — an approver who is not the author — is explicitly named as
   * something that "may be added later", and adding it means narrowing this one
   * list rather than disentangling approval from drafting across five screens.
   *
   * What this closes is the residual risk the previous entry carried: with a
   * President-only grant, the club could not approve anything while the
   * President was unavailable, which for a student club between terms is not a
   * hypothetical.
   */
  event_approval: capability({
    key: "event_approval",
    action: "approve an event and release its invitations",
    roleCodes: ["president", "vice_president", "secretary", "general_manager", "it_officer"],
    decision:
      "Brian, 12 August 2026 (LAN-77 owner clarification): the President, Vice-President, " +
      "Secretary and General Manager are each authorized for the approval workflow, and an " +
      "authorized operator may approve their own draft in the MVP. Supersedes the lead's " +
      "President-only assumption recorded on LAN-73. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * Recording attendance for an event that has occurred — the general path.
   * LAN-80.
   *
   * ## Why this exists, when `attendance_recorder` already did
   *
   * They are two different grants for two different surfaces, and LAN-73 said
   * so before either was built: `attendance_recorder` above is LAN-110's narrow
   * coaching grant, and its note records that the general path "resolves to
   * 'authorized operator', not to role codes, and LAN-80 owns it".
   *
   * LAN-80 owning it means deciding it, and the first implementation did not —
   * it used `requireOperator()`, the ordinary-operator floor. That was wrong in
   * a way independent review caught: LAN-80's own acceptance criteria, from
   * Brian's 12 August 2026 coach decision, require that "an unauthorized coach
   * and ordinary player are refused at the service boundary, including direct
   * action calls". An ordinary player who holds an operator account is not
   * refused by a floor that admits every linked operator, so the floor failed a
   * criterion rather than merely being generous.
   *
   * ## The grant, and why it is a union
   *
   * The four calendar roles, plus the three coaching seats:
   *
   *   * **The four** because `docs/ux/slice-ux.md` § 8 lists General attendance
   *     as an authorized-operator action, and because gating it on the coaching
   *     grant alone would lock the Exec out of their own attendance screen —
   *     which is exactly what `attendance_recorder`'s note warns against.
   *   * **The three coaching seats** because Brian's 12 August decision puts
   *     them on this workflow explicitly: "an authorized coach may set and
   *     correct Present, Absent, Late or Excused".
   *
   * The Treasurer is excluded, for the same reason they are excluded from
   * `event_calendar_management`, `event_approval` and `delivery_administration`:
   * nothing about attendance distinguishes it from those, and no recorded
   * decision puts them on the club's event workflow.
   *
   * ## What it is not
   *
   * It is not a replacement for `attendance_recorder`, and it does not widen it.
   * That capability stays the three coaching seats plus the administrative seat
   * LAN-124 added, because LAN-110 uses it to decide who gets the **narrow**
   * surface — a Secretary holds this
   * one and not that one, and should get the operator's board rather than the
   * coach's. Two grants, two questions: "may you record at all", and "is the
   * constrained screen yours".
   *
   * A lead derivation, like the two below it, and narrowed by editing one array.
   */
  attendance_recording: capability({
    key: "attendance_recording",
    action: "record attendance for an event that has occurred",
    roleCodes: [
      "president",
      "vice_president",
      "secretary",
      "general_manager",
      "head_coach",
      "offence_coach",
      "defence_coach",
      "it_officer",
    ],
    decision:
      "Lead, 14 August 2026 (LAN-80), after independent review: the union of the four " +
      "calendar roles — so the Exec is not locked out of their own screen — and the three " +
      "coaching seats Brian's 12 August 2026 decision put on this workflow. Replaces an " +
      "any-linked-operator floor that failed LAN-80's criterion that an ordinary player is " +
      "refused at the service boundary. Recorded as an assumption on LAN-80. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * The occurrence assertion — **Mark occurred** and **Mark not held**, and the
   * correction of either. LAN-80.
   *
   * It is its own capability rather than a reuse of `event_calendar_management`
   * because `docs/ux/slice-ux.md` § 8 lists it as its own row in the
   * authorization contract, and because it is the one thing the contract says
   * explicitly is *not* implied by something else: "Authorized operator only;
   * not implied by attendance-recorder capability". A coach who may record
   * attendance may not decide that there was anything to record.
   *
   * The grant is a lead derivation from two recorded decisions, not a new one:
   *
   *   * Brian's LAN-77 clarification — "only active President, Vice President,
   *     Secretary, and General Manager role holders may create, edit, abandon,
   *     or approve calendar events". Asserting what happened to an event is a
   *     change to the club's calendar record of it, and it is the gate that
   *     opens attendance.
   *
   *   * LAN-110's fixed boundary — "Coaches cannot mark an event occurred or
   *     not held unless a separate authorization rule explicitly grants that
   *     action". No coaching seat is listed here, and none may be added without
   *     that separate rule.
   *
   * Like every other derivation in this file it is cheap to narrow: separation
   * of duties, or restricting the assertion to the approver, is an edit to one
   * array. Flagged as an assumption on LAN-80's pull request.
   */
  event_occurrence_assertion: capability({
    key: "event_occurrence_assertion",
    action: "assert that an event occurred or was not held",
    roleCodes: ["president", "vice_president", "secretary", "general_manager", "it_officer"],
    decision:
      "Lead, 14 August 2026 (LAN-80): derived from Brian's LAN-77 event-workflow authority " +
      "and from LAN-110's boundary that no coaching seat may assert occurrence. Recorded as " +
      "an assumption on LAN-80 and narrowed by editing this list. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * Undecided, and therefore refused to everyone.
   *
   * Operator-account and role administration is explicitly out of this slice
   * (`docs/ux/tickets/LAN-73-shell-and-access.md`, "Explicitly not in this
   * ticket"). The capability is named here so that the map enumerates every
   * privileged action the slice can refuse, and so that an attendance recorder
   * can be *proved* to be refused it. Whoever builds it decides who holds it —
   * with Brian, not in passing.
   */
  role_management: capability({
    key: "role_management",
    action: "manage operator accounts and role assignments",
    roleCodes: ["it_officer"],
    decision:
      "Brian, 15 August 2026 (LAN-124): the IT Officer is the club's administrative seat and " +
      "holds this. It was the one entry the slice left open. **No screen or service " +
      "implements it yet** — `manageRoles` is still `notImplemented`, so holding this grants " +
      "the authority and not yet the ability, and operator accounts and role assignments are " +
      "still written to the database by hand. The grant is deliberately the narrowest list in " +
      "this file and the widest in it: whoever holds it can assign themselves every other " +
      "capability the moment a screen exists, which is why no calendar role was added " +
      "alongside.",
  }),

  /**
   * Delivery administration — inspecting delivery status, retrying a failed
   * invitation, and revoking and reissuing a link.
   *
   * This entry previously read `[]`, refused to everybody, because LAN-78 was
   * blocked behind the LAN-92 decision gate. That gate is closed and LAN-78 is
   * built, so the grant has to be decided rather than left empty — an empty
   * grant would ship a delivery screen nobody could open.
   *
   * It resolves to the same four roles as `event_approval`, and that is a
   * derivation from recorded decisions rather than a new one:
   *
   *   * Brian's LAN-77 clarification says "only active President, Vice
   *     President, Secretary, and General Manager role holders may create,
   *     edit, abandon, or approve calendar events". Repairing the delivery of
   *     invitations that an approval released is the same workflow, one step
   *     further along — the operator who took the decision to contact forty
   *     people is the operator who fixes it when two of them were not reached.
   *
   *   * `docs/ux/slice-ux.md` § 3 states that a coaching seat receives "no
   *     general operator navigation, roster editing, event administration,
   *     delivery, report, contact, RSVP-reason, or availability data". Delivery
   *     is named explicitly, so no coaching role may hold this.
   *
   *   * The Treasurer is excluded for the same reason they are excluded from
   *     `event_calendar_management`, and nothing about delivery distinguishes
   *     the two.
   *
   * It is a lead derivation and it is cheap to narrow: separation of duties, or
   * a dedicated delivery role, is an edit to one array in this file. It is
   * flagged in LAN-78's pull request as the assumption it is.
   */
  delivery_administration: capability({
    key: "delivery_administration",
    action: "inspect delivery, retry a failed invitation, and reissue a link",
    roleCodes: ["president", "vice_president", "secretary", "general_manager", "it_officer"],
    decision:
      "Lead, 13 August 2026 (LAN-78): derived from Brian's LAN-77 event-workflow authority — " +
      "delivery repair is the continuation of the approval that released the invitations — and " +
      "from slice-ux.md § 3, which names delivery among the surfaces a coaching seat never " +
      "receives. Recorded as an assumption on LAN-78 and narrowed by editing this list. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),

  /**
   * The Monday exception and action report — previewing it, generating a
   * snapshot, and reading a stored one.
   *
   * This entry previously read `[]`, refused to everybody, because
   * `docs/ux/slice-ux.md` § 8 restricts the report to an "authorized report
   * operator" without saying who that is, and LAN-73 deferred the answer to
   * LAN-81. LAN-81 is this issue, and an empty grant would ship a report screen
   * nobody could open — the same position `delivery_administration` was in
   * before LAN-78 resolved it, and resolved the same way.
   *
   * The four calendar roles, and that is a derivation from recorded decisions
   * rather than a new one:
   *
   *   * Brian's LAN-77 clarification — "only active President, Vice President,
   *     Secretary, and General Manager role holders may create, edit, abandon,
   *     or approve calendar events". The Monday review is the same operating
   *     group reading the consequences of the week they ran, and it is the
   *     group that can act on every exception it leads with: a nonresponse to
   *     chase, an approval defect to correct, a register nobody completed.
   *
   *   * `slice-ux.md` § 3 states that a coaching seat receives "no general
   *     operator navigation, roster editing, event administration, delivery,
   *     **report**, contact, **RSVP-reason**, or availability data". The report
   *     is named, and so is the one kind of content it leads with that nothing
   *     else in the slice displays. No coaching role may hold this.
   *
   *   * The Treasurer is excluded for the same reason they are excluded from
   *     `event_calendar_management`, `event_approval` and
   *     `delivery_administration`. Nothing about the Monday review
   *     distinguishes it from those three, and no recorded decision puts the
   *     Treasurer on the club's event workflow. The report carries no finance
   *     content: subscription status appears in it only as an outstanding
   *     onboarding item, exactly as it does on the roster.
   *
   * What makes this grant worth reading twice rather than once: the snapshot
   * contains **the reasons people gave for not attending**, which the approved
   * MVP boundary puts in the lead. That is the most sensitive content in the
   * slice, it is shown to the operator group only, and it is never exported or
   * copied into anything shared. Narrowing this list is an edit to one array,
   * and widening it is a privacy decision rather than a convenience.
   *
   * A lead derivation, flagged as the assumption it is on LAN-81's pull request.
   */
  leadership_report: capability({
    key: "leadership_report",
    action: "read the Monday exception and action report",
    roleCodes: ["president", "vice_president", "secretary", "general_manager", "it_officer"],
    decision:
      "Lead, 14 August 2026 (LAN-81): derived from Brian's LAN-77 event-workflow authority — " +
      "the group that ran the week reads and acts on its exceptions — and from slice-ux.md " +
      "§ 3, which names the report and RSVP reasons among the surfaces a coaching seat never " +
      "receives. Replaces the empty grant LAN-73 recorded and LAN-81 owed. Recorded as an " +
      "assumption on LAN-81 and narrowed by editing this list. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file.",
  }),
});

/**
 * The capabilities a **narrow attendance recorder** may hold, and the whole of
 * what that phrase means. LAN-110.
 *
 * ## The question this answers
 *
 * `docs/ux/slice-ux.md` § 3 says an active Head Coach, OC or DC assignment
 * "receives only the occurred-event attendance surface. No general operator
 * navigation, roster editing, event administration, delivery, report, contact,
 * RSVP-reason, or availability data is exposed."
 *
 * That is a **narrowing**, and it is the only thing LAN-110 adds to this file:
 * no new grant, no new role code, no widening of anything. `attendance_recorder`
 * and `attendance_recording` already say what a coach may *do*; this says what
 * a coach may *see*, which the two capabilities above cannot express on their
 * own because the surfaces being withheld — Roster, Report, the event detail —
 * are open to any linked active operator and have no capability to fail.
 *
 * ## Why it is derived rather than a fourth grant
 *
 * The alternative was to give Roster and the event list a capability of their
 * own and leave the coaching seats off it. That would have been a decision
 * about who may read the roster — a decision nobody has taken, which would have
 * quietly removed the Social Secretary's roster access as a side effect of a
 * coaching ticket. Narrowing by derivation touches exactly one actor: the one
 * whose only authority is coaching.
 *
 * ## The rule, and the case it deliberately does not catch
 *
 * An operator is a narrow recorder when they hold `attendance_recorder` **and**
 * hold no capability outside this set. So:
 *
 *   * Head Coach alone, OC alone, DC alone, or any combination — narrow. They
 *     get the coach shell.
 *   * Head Coach **and** Secretary — not narrow. § 3 describes what a coach
 *     receives, not a rule for stripping authority a recorded decision granted
 *     to somebody who also coaches, and `attendance_recorder`'s own note above
 *     already says a Secretary "should get the operator's board rather than the
 *     coach's". Their Secretary authority is unchanged and each of its actions
 *     still guards itself.
 *   * Nobody else. An operator holding no capability at all is not a narrow
 *     recorder — they are an ordinary operator with nothing granted, and they
 *     keep the ordinary shell and its refusals.
 *
 * Because the rule can only ever *remove* surfaces from one actor, getting the
 * boundary case wrong in the permissive direction cannot grant anything: a
 * misclassified operator sees the ordinary shell, where every privileged action
 * still refuses them individually.
 *
 * Recorded as a lead derivation on LAN-110, from § 3 and from LAN-110's fixed
 * boundaries. Widening it back is an edit to this one set.
 */
export const NARROW_RECORDER_CAPABILITIES: readonly CapabilityKey[] = Object.freeze([
  "attendance_recorder",
  "attendance_recording",
]);

/**
 * Is this operator's authority *only* the coaching attendance recorder?
 *
 * Pure, and takes role codes rather than a session, for the same reason
 * `roleCodesPermit` does: the shell, a page, a server action and a test with an
 * arbitrary actor must all get the same answer from the same function.
 *
 * This is never an authorization decision on its own. It decides what to
 * **render** and which surfaces to withhold; every action behind every surface
 * still calls its own guard.
 */
export function isNarrowAttendanceRecorder(roleCodes: readonly string[]): boolean {
  if (!roleCodesPermit(roleCodes, "attendance_recorder")) return false;

  return CAPABILITY_KEYS.every(
    (key) => NARROW_RECORDER_CAPABILITIES.includes(key) || !roleCodesPermit(roleCodes, key),
  );
}

/**
 * The coaching seats this operator actually holds, for the shell to caption the
 * signed-in name with — "Head Coach", as UX-91's sidebar shows.
 *
 * A disclosure to the holder of the account about their own account, after the
 * session has been verified, and nothing else: it never names another person,
 * and it never appears in a refusal, where naming what the reader holds is
 * forbidden.
 */
export function describeHeldCoachingSeats(roleCodes: readonly string[]): string {
  return describeRoles(
    capabilityRoleCodes("attendance_recorder").filter((code) => roleCodes.includes(code)),
  );
}

/**
 * The `roles.code` values that make somebody a **coach** when an event's
 * audience is built.
 *
 * This is not a capability — holding one of these seats permits nothing on its
 * own, and `attendance_recorder` above is where the coaching *grant* lives. It
 * is here because `tests/capability-map-single-source.test.ts` makes this module
 * the only place in `src/` allowed to name a role code, and that rule is worth
 * more than the tidiness of keeping it beside the audience code that uses it.
 * One file to read when the catalogue changes.
 *
 * The audience catalogue used to derive capacity from a role's *scope*:
 * season-scoped meant coach. That was exhaustive while the only season-scoped
 * roles were these three, and wrong on the first addition — register D8 puts
 * coaching staff on the season because coaches are appointed around seasons, not
 * because everything appointed around a season coaches. A team manager, a physio
 * or a season-scoped kit officer would each have become `coach` capacity
 * silently: offered under **All active coaches**, invited as a coach, and
 * recorded as one in the audit trail.
 *
 * A season-scoped role that is not listed here is **not offered at all**, which
 * is the fail-closed direction — an uninvitable role is a smaller problem than
 * one invited under a capacity nobody chose for it.
 *
 * `tests/operator-capability-catalogue.test.ts` checks every code named in this
 * module against the real seeded `public.roles`, so a typo fails a test rather
 * than silently emptying the coaching group.
 */
export const COACH_ROLE_CODES: readonly string[] = Object.freeze([
  "head_coach",
  "offence_coach",
  "defence_coach",
]);

/** Every capability key, for tests and for exhaustive iteration. */
export const CAPABILITY_KEYS: readonly CapabilityKey[] = Object.freeze(
  Object.keys(CAPABILITIES) as CapabilityKey[],
);

/** The role codes permitted to exercise a capability. Never widened here. */
export function capabilityRoleCodes(key: CapabilityKey): readonly string[] {
  return CAPABILITIES[key].roleCodes;
}

/**
 * Display form of a set of role codes: "President", or "President, Secretary
 * or General Manager". Used only to tell a refused operator what the action
 * needs — never to say what they hold.
 */
export function describeRoles(codes: readonly string[]): string {
  const labels = codes.map((code) => ROLE_LABELS[code] ?? code);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/**
 * One sentence naming what an action requires. This is the half of a refusal
 * that is safe to show: it describes the action's requirement, and says nothing
 * whatever about the person reading it.
 */
export function describeRoleRequirement(codes: readonly string[]): string {
  if (codes.length === 0) {
    return "No club role is currently authorized to perform this action.";
  }
  if (codes.length === 1) {
    return `This action requires the ${describeRoles(codes)} role.`;
  }
  return `This action requires one of these roles: ${describeRoles(codes)}.`;
}

/** The same sentence, for a named capability. */
export function capabilityRequirement(key: CapabilityKey): string {
  return describeRoleRequirement(CAPABILITIES[key].roleCodes);
}

/**
 * Does this set of currently-effective role codes include one the capability
 * permits?
 *
 * Pure, and deliberately takes role codes rather than a session: the same
 * decision has to be checkable from a test with an arbitrary actor, from a
 * server action and from a page, without any of them differing.
 */
export function roleCodesPermit(roleCodes: readonly string[], key: CapabilityKey): boolean {
  const permitted = CAPABILITIES[key].roleCodes;
  if (permitted.length === 0) return false;
  return roleCodes.some((code) => permitted.includes(code));
}
