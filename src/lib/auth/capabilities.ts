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
 * capabilities to a subset of them. Ten of them are the fixed coaching
 * hierarchy, and since LAN-129 all ten hold the same narrow attendance pair —
 * see `FIXED_COACHING_ROLE_CODES` for what that grant is and where it came
 * from. The other seats that hold nothing (Treasurer aside, who holds
 * membership activation) hold nothing because no decision has reached them.
 *
 * ## The grants, and who decided them
 *
 * | Capability                | Roles                                          | Decided by         |
 * | ------------------------- | ---------------------------------------------- | ------------------ |
 * | Attendance recorder       | the ten fixed coaching seats                    | Brian, 12+18 Aug   |
 * | Attendance recording      | the four calendar roles, plus those ten seats   | Lead, 14 Aug 2026  |
 * | Membership activation     | the four offices, plus `general_manager`       | Lead, 12 Aug 2026  |
 * | Event calendar management | President, VP, Secretary, General Manager      | Brian, 12 Aug 2026 |
 * | Event approval            | President, VP, Secretary, General Manager      | Brian, 12 Aug 2026 |
 * | Delivery administration   | President, VP, Secretary, General Manager      | Lead, 13 Aug 2026  |
 * | Leadership report         | President, VP, Secretary, General Manager      | Lead, 14 Aug 2026  |
 * | Role management           | President, General Manager, IT Officer         | Brian, 18 Aug 2026 |
 *
 * **Every capability above also lists `it_officer`.** Brian decided on 15
 * August 2026 (LAN-124) that the IT Officer is the club's administrative seat
 * and holds every privileged action in the slice. That is an administrative
 * grant rather than a demonstration affordance: `role_management` was held by
 * nobody at all.
 *
 * `role_management` is no longer the IT Officer's alone. Brian widened it on 18
 * August 2026 (`DEC-role-management-authority`) to the President, the General
 * Manager and the IT Officer, and that is the decision LAN-129 applies.
 *
 * ## The hazard that widening carries, and the layer that answers it
 *
 * The note this file has carried since LAN-124 is still true and is now true of
 * three seats rather than one: **whoever holds `role_management` can assign
 * themselves anything else.** Widening the grant widens that hazard, and Brian
 * took the decision knowing it.
 *
 * What answers it is not a condition in this file. `./administration-authority.ts`
 * adds a second, separate layer: capabilities answer *"may this operator do X
 * at all"*, and the leadership, self-action and final-path guards there answer
 * *"may this operator do X **to this particular target**"*. The General Manager
 * seat, the President seat and the actor's own account are protected there, by
 * rules that read the tier data below. Keeping the two apart is what lets each
 * be checked by reading: this file stays a flat table of grants with no
 * conditionals in it, and the target rules stay a short list of named cases.
 *
 * None of them is re-derived here, and none may be re-derived by a later
 * implementer: they are recorded owner and lead decisions on LAN-73, LAN-77,
 * LAN-78, LAN-124 and LAN-129.
 */

/** The privileged actions this slice knows about. */
export type CapabilityKey =
  | "attendance_recorder"
  | "membership_activation"
  | "event_calendar_management"
  | "event_approval"
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
 * Display labels for **every** role code in the approved catalogue.
 *
 * Presentation text owned by this module, mirroring `roles.name` in
 * `supabase/migrations/20260819090100_role_catalogue.sql`. It exists so that a
 * refusal can say "the President role" rather than "the president role code",
 * and since LAN-129 so that Administration's plain-language copy comes from the
 * same module the server enforces from (`REQ-capability-copy-consistency`,
 * `DEC-permission-transparency`).
 *
 * ## Why a second copy of the names is tolerable here, and what stops it drifting
 *
 * Independent review recorded this as a duplication (LAN128-A1): `roles.name`
 * is migration-owned and authoritative, and this map repeats it. The
 * duplication is not removable by reading the database, because the two
 * properties this module is built to have — pure, and frozen at runtime — mean
 * it may not open a connection, and `tests/capability-map-single-source.test.ts`
 * enforces that by scanning the source.
 *
 * So the copy stays and is **pinned instead**:
 * `tests/operator-capability-catalogue.test.ts` reads `public.roles` and asserts
 * that this map covers exactly the catalogue's codes and that every label is
 * character-for-character the catalogue's `name`. Renaming a seat in a
 * migration without renaming it here fails that test, which is the drift the
 * finding was about. It was previously nine codes with a silent fallback to the
 * raw code, and nothing checked it at all.
 *
 * The club says "Offensive Coordinator" and "Defensive Coordinator" for the two
 * seats the catalogue calls `offence_coach` and `defence_coach`; Brian
 * confirmed on 12 August 2026 that these are those seats, and the approved
 * catalogue names them that way. The codes were left alone deliberately when
 * the names changed (LAN-128): a code is an identifier, and renaming it would
 * have rewritten every existing assignment's key for a cosmetic reason. The
 * previous names survive as `role_aliases` rows.
 *
 * `describeRoles()` still falls back to the raw code for anything absent, which
 * is ugly on screen but never wrong. Nothing in the catalogue reaches that
 * branch any more; an invented or mistyped code does.
 */
export const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  // Operational Administration
  general_manager: "General Manager",
  it_officer: "IT Officer",
  // Club Committee
  president: "President",
  vice_president: "Vice-President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  social_secretary: "Social Secretary",
  gameday_secretary: "Gameday Secretary",
  kit_manager: "Kit Manager",
  media_secretary: "Media Secretary",
  // Coaching Staff
  head_coach: "Head Coach",
  offence_coach: "Offensive Coordinator",
  defence_coach: "Defensive Coordinator",
  quarterbacks_coach: "Quarterbacks Coach",
  offensive_line_coach: "Offensive Line Coach",
  wide_receivers_coach: "Wide Receivers Coach",
  defensive_line_coach: "Defensive Line Coach",
  linebackers_coach: "Linebackers Coach",
  defensive_backs_coach: "Defensive Backs Coach",
  special_teams_coach: "Special Teams Coach",
});

/**
 * The **leadership tiers** `DEC-two-tier-operating-model` names, as data.
 *
 * This is the one thing `./administration-authority.ts` needs from the
 * catalogue and cannot express without naming a role code — and
 * `tests/capability-map-single-source.test.ts` makes this module the only place
 * in `src/` allowed to name one. So the codes live here, beside every other
 * code, and the *rules* about them live there. Neither file has both.
 *
 * It is emphatically **not** a hierarchy the capability map consults. No
 * function in this file reads it, no grant is derived from it, and holding a
 * tier confers nothing: `role_management` is granted to three seats by being
 * written into that entry's list, exactly as every other grant is. A tier only
 * ever makes a seat *harder* to administer.
 *
 * The three tiers, quoted from `DEC-two-tier-operating-model`:
 *
 *   * `standing_continuity` — the General Manager, "the standing continuity
 *     authority above President for leadership transition".
 *   * `presiding` — the President.
 *   * `technical_administration` — the IT Officer, who "holds transitional
 *     technical administration".
 *
 * The Vice-President and Secretary are deliberately absent. The same decision
 * puts them in "the broad ordinary operating tier": they keep every ordinary
 * operating capability and administer no account and no assignment, which is
 * expressed by their absence from `role_management` above, not by a tier.
 */
export type LeadershipTier = "standing_continuity" | "presiding" | "technical_administration";

/** Which tier a role code sits in, or absent for the seventeen that sit in none. */
export const LEADERSHIP_TIERS: Readonly<Record<string, LeadershipTier>> = Object.freeze({
  general_manager: "standing_continuity",
  president: "presiding",
  it_officer: "technical_administration",
});

/** The seat each tier is, so a refusal can name it without a code literal. */
export const LEADERSHIP_TIER_SEATS: Readonly<Record<LeadershipTier, string>> = Object.freeze({
  standing_continuity: "general_manager",
  presiding: "president",
  technical_administration: "it_officer",
});

/**
 * The two tiers `REQ-final-admin-protection` **protects** from ordinary
 * administration. The IT Officer's tier is deliberately not one — see
 * `./administration-authority.ts`, which explains why at length.
 */
export type ProtectedLeadershipTier = "standing_continuity" | "presiding";

/**
 * Who may act on a protected seat, by tier and by kind of action.
 *
 * This is here rather than beside the rules that read it for one reason:
 * `tests/capability-map-single-source.test.ts` makes this module the only place
 * in `src/` allowed to name a `roles.code`, and that property is worth more than
 * the tidiness of keeping the table beside its rules. So the split is by *kind
 * of knowledge* — role codes live here with every other role code, and the
 * rules that consume them live in `./administration-authority.ts` and mention
 * no code at all. One file to read when the catalogue changes; one file to read
 * when the authority model changes.
 *
 * It is **not** a capability and nothing in this file consults it. Holding a
 * listed code permits nothing on its own: an actor reaches these rules only
 * after `role_management` has already admitted them, and these lists can only
 * narrow that. An empty list means the mission leaves no ordinary route, which
 * is a decision (`REQ-final-admin-protection`: "General Manager replacement
 * remains exceptional IT/service recovery outside this mission") and never a
 * placeholder.
 *
 * Every entry is quoted from an approved source in the rules module's note.
 */
export const PROTECTED_LEADERSHIP_AUTHORITY: Readonly<
  Record<ProtectedLeadershipTier, Readonly<Record<"management" | "recovery", readonly string[]>>>
> = Object.freeze({
  standing_continuity: Object.freeze({
    management: Object.freeze([]) as readonly string[],
    recovery: Object.freeze(["it_officer"]) as readonly string[],
  }),
  presiding: Object.freeze({
    management: Object.freeze(["general_manager"]) as readonly string[],
    recovery: Object.freeze(["general_manager", "it_officer"]) as readonly string[],
  }),
});

/**
 * The ten fixed coaching seats — the catalogue's Coaching Staff group.
 *
 * Listed rather than derived, for the same reason every grant in this file is
 * listed: a set computed from a scope, a group or a name pattern silently
 * adopts the next row that matches it, and `tests/operator-capability-catalogue.test.ts`
 * exists because that exact thing nearly happened when the catalogue grew from
 * three coaching seats to ten.
 *
 * `REQ-coach-operator-onboarding` and `DEC-coach-catalogue` (Brian, 18 August
 * 2026) are what put all ten on the attendance grants: "every fixed coaching
 * role receives only the approved narrow attendance capability, including
 * minimal walk-up capture". Walk-up capture is guarded by
 * `attendance_recording`, so "the narrow attendance capability" is the pair —
 * `attendance_recorder`, which decides that the constrained coach screen is
 * theirs, and `attendance_recording`, which decides that they may write to it.
 * A seat holding only the first would be classified a narrow recorder, offered
 * the coach's surface, and refused every action on it.
 *
 * The same requirement's "plus current availability viewing and Orange/Red
 * reporting" grants nothing here and deliberately so: **there is no
 * availability feature in this repository**, no capability guards one, and
 * inventing a grant for an action no code performs would record a decision as
 * enforcement when it is neither. The Availability Management mission owns it,
 * and this note is where it starts.
 */
export const FIXED_COACHING_ROLE_CODES: readonly string[] = Object.freeze([
  "head_coach",
  "offence_coach",
  "defence_coach",
  "quarterbacks_coach",
  "offensive_line_coach",
  "wide_receivers_coach",
  "defensive_line_coach",
  "linebackers_coach",
  "defensive_backs_coach",
  "special_teams_coach",
]);

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
    /**
     * Names the **surface**, not the act — LAN-141 finding 12.
     *
     * All ten coaching seats hold this and `attendance_recording`, and their
     * two `action` strings were written by different issues and never read side
     * by side: "record attendance for an occurred event" above "record
     * attendance for an event that has occurred", one under the other, on every
     * coach's Permissions panel. No reader could tell them apart, because as
     * sentences they are the same sentence.
     *
     * They are not the same grant. This one decides who gets the **narrow**
     * coach's screen (see the note above); the other decides who may record at
     * all. Saying which is which is what makes the pair legible.
     */
    action: "use the coach's own attendance screen, on a phone",
    roleCodes: [...FIXED_COACHING_ROLE_CODES, "it_officer"],
    decision:
      "Brian, 12 August 2026 (LAN-108/LAN-110): the Head Coach, Offensive Coordinator " +
      "and Defensive Coordinator seats only. Assistant coaches do not hold them, and no " +
      "assistant role exists in the catalogue. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file. " +
      "Brian, 18 August 2026 (REQ-coach-operator-onboarding, DEC-coach-catalogue, " +
      "LAN-129) widened it to all ten fixed coaching seats: 'every fixed coaching role " +
      "receives only the approved narrow attendance capability'. Still no assistant seat, " +
      "and still nothing else — the seven added here hold these two capabilities and no " +
      "other, which tests/operator-capability-catalogue.test.ts asserts against the real " +
      "catalogue.",
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
      ...FIXED_COACHING_ROLE_CODES,
      "it_officer",
    ],
    decision:
      "Lead, 14 August 2026 (LAN-80), after independent review: the union of the four " +
      "calendar roles — so the Exec is not locked out of their own screen — and the three " +
      "coaching seats Brian's 12 August 2026 decision put on this workflow. Replaces an " +
      "any-linked-operator floor that failed LAN-80's criterion that an ordinary player is " +
      "refused at the service boundary. Recorded as an assumption on LAN-80. " +
      "Brian, 15 August 2026 (LAN-124) added it_officer, the administrative seat that " +
      "holds every capability in this file. " +
      "Brian, 18 August 2026 (REQ-coach-operator-onboarding, LAN-129) extended the " +
      "coaching half to all ten fixed coaching seats, because the approved narrow " +
      "attendance capability includes 'minimal walk-up capture' and walk-up capture is " +
      "guarded here. The Treasurer is still excluded.",
  }),

  /*
   * `event_occurrence_assertion` was here, and it is gone.
   *
   * It guarded **Mark occurred**, **Mark not held** and the correction of
   * either. LAN-151 retired all three with the concept behind them: nothing
   * asserts that an event occurred, because the date passing without a
   * cancellation is the whole of it (D30, REQ-occurrence-retired).
   *
   * Removed rather than left in place unused. A capability nobody checks is an
   * authorization decision with no subject — it would still appear in the
   * operator catalogue, still be grantable, and still read to somebody as a
   * permission the club hands out, for an action that does not exist.
   *
   * What it protected is not lost. `docs/ux/slice-ux.md` § 8's rule that a
   * coach who records attendance may not decide that there was anything to
   * record survives as the fact that there is no such decision for anybody to
   * make; `attendance_recording` still guards the register itself, and the
   * service layer still refuses a register for an event whose date has not
   * passed.
   */

  /**
   * Operator-account and role administration — the floor every Administration
   * read and every Administration write stands on.
   *
   * ## The grant
   *
   * President, General Manager and IT Officer, and nobody else. That is
   * `DEC-role-management-authority`, locked by Brian on 18 August 2026, and
   * `REQ-role-management-authority` states it in the same words: "President,
   * General Manager and IT Officer hold role_management. Vice-President and
   * Secretary retain broad ordinary operating capabilities but cannot
   * administer accounts or role assignments."
   *
   * The Vice-President and the Secretary are the two seats a reader is most
   * likely to add by mistake, because they hold every *other* capability the
   * President does — the calendar, approval, occurrence, delivery, the Monday
   * report. Administration is the one place the operating tier stops, and that
   * is the whole content of the two-tier model.
   *
   * The IT Officer's grant is **transitional**. `DEC-role-management-authority`
   * says so, and says it "may later be removed only by a reviewed owner
   * decision and code change" — which, because this file is data, is the
   * deletion of one string from one array.
   *
   * ## What this capability is not
   *
   * It is not permission to administer a *particular person*. Holding it means
   * the Administration surfaces open and their actions are reachable; whether
   * this actor may end *that* assignment, deactivate *that* account or recover
   * *that* email is a second question, answered in
   * `./administration-authority.ts` by `REQ-final-admin-protection`'s
   * leadership, self-action and final-path rules. A screen that called
   * `requireCapability("role_management")` and stopped there would let the
   * President deactivate the General Manager, and would let any of the three
   * remove their own last administration path.
   *
   * The hazard Brian recorded on 15 August 2026 is unchanged and now applies to
   * three seats rather than one: whoever holds this can assign themselves every
   * other capability in this file. Nothing here prevents that, self-assignment
   * is deliberately not forbidden by the self-action rule, and the mitigation is
   * that every such assignment is a recorded, attributable audit event.
   */
  role_management: capability({
    key: "role_management",
    action: "manage operator accounts and role assignments",
    roleCodes: ["president", "general_manager", "it_officer"],
    decision:
      "Brian, 15 August 2026 (LAN-124): the IT Officer is the club's administrative seat and " +
      "holds this. It was the one entry the slice left open. " +
      "Brian, 18 August 2026 (DEC-role-management-authority, applied by LAN-129): widened to " +
      "the President and the General Manager alongside it. The Vice-President and Secretary " +
      "are deliberately excluded — they keep every ordinary operating capability and " +
      "administer no account and no assignment. The IT Officer's share is transitional and " +
      "may be removed only by a reviewed owner decision and a code change. Target-level " +
      "authority over a particular person is a separate layer: see " +
      "src/lib/auth/administration-authority.ts.",
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
 *
 * ## Why this is the same list as `FIXED_COACHING_ROLE_CODES`, and not by accident
 *
 * The two answer different questions. `FIXED_COACHING_ROLE_CODES` is the
 * catalogue's Coaching Staff group, and it is what the attendance capabilities
 * are granted to; this one decides **who the club invites to a practice under
 * "All active coaches"** — real messages to real phones.
 *
 * They gave different answers for one round. LAN-129 widened the capability
 * grant to all ten fixed coaching seats and deliberately left this at three,
 * because widening it changes who the club *contacts* rather than who may do
 * what, and no source then in front of the mission asked for it. That left the
 * seven new seats able to take a register and never invited to the session they
 * would take it at, which was flagged as a gap rather than closed in passing.
 *
 * Brian answered it on 19 August 2026: "Every coach needs to be invited to
 * coaching sessions. Coaches should be an audience that's included, which
 * includes all the coaches." So the audience group **is** the coaching staff,
 * and the two lists are one list — expressed by aliasing rather than by
 * retyping ten codes, so that they cannot drift apart while nobody is looking.
 *
 * ## What would split them again
 *
 * A decision that some coaching seat should hold the attendance capability and
 * not be invited, or be invited and hold nothing. Neither exists. If one is
 * ever taken, this becomes its own literal list again and that edit is the
 * record of the decision — which is why the two names survive rather than being
 * collapsed into one. A caller asking "who coaches, for the purpose of
 * inviting people" is asking a different question from one asking "which seats
 * carry the coaching grant", and the code should keep letting them ask it.
 *
 * ## What this does *not* become
 *
 * A general audience model. Brian has sketched a wider one — all players, all
 * coaches, recruits invitable only to recruitment events behind a guard,
 * council and standing seats — and it is explicitly not approved scope. No new
 * group, no recruit gating and no council group is added here.
 *
 * The fail-closed property is unchanged and still matters: a season-scoped seat
 * that is not in this list is not offered *at all*, rather than taking the
 * coach capacity because of where it hangs. A team manager or a season-scoped
 * physio would still be uninvitable rather than silently invited as a coach,
 * and `src/lib/services/event-approval.test.ts` proves it against a real row.
 */
export const COACH_ROLE_CODES: readonly string[] = FIXED_COACHING_ROLE_CODES;

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
  const labels = codes.map((code) => roleLabel(code));
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

/**
 * The club's name for one role code, or the code itself.
 *
 * The one function Administration calls to render a seat, so that every screen
 * spells "Offensive Coordinator" the way the catalogue migration does.
 */
export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}

/**
 * Every capability one role code holds, in map order.
 *
 * `REQ-capability-copy-consistency` and `DEC-permission-transparency`: the
 * Permissions summary the Roles page shows is "derived from the same reviewed
 * capability definition as enforcement", so that "a later approved grant change
 * updates authorization and plain-language UI copy together rather than leaving
 * stale duplicated descriptions".
 *
 * This is the derivation, and it is the whole mechanism: the copy is not a
 * second list somebody maintains beside the grants — it is a projection *of*
 * the grants, computed from the same arrays `roleCodesPermit()` reads. Adding a
 * role to a grant changes the sentence on the Roles page in the same commit,
 * because there is nowhere else for the sentence to come from.
 */
export function roleCapabilities(code: string): readonly Capability[] {
  return CAPABILITY_KEYS.filter((key) => CAPABILITIES[key].roleCodes.includes(code)).map(
    (key) => CAPABILITIES[key],
  );
}

/**
 * What Administration says about a role that holds nothing.
 *
 * Ten of the twenty seats hold no privileged action at all, and a blank
 * Permissions summary reads as an omission rather than as the fact it is. The
 * approved catalogue deliberately includes such roles
 * (`REQ-role-definition-and-permission-boundary`: administrators "may assign
 * people to the approved static catalogue, including roles that currently carry
 * no privileged capabilities"), so the empty case is a sentence, not an absence.
 */
export const NO_CAPABILITY_SUMMARY =
  "This role carries no privileged actions in the application. Someone holding it " +
  "signs in as an ordinary operator.";

/**
 * The plain-language Permissions summary for one role code.
 *
 * One phrase per capability, taken verbatim from each entry's `action` — which
 * is already written in the club's language because it is what a refusal
 * quotes. Never empty: a role with no grant gets `NO_CAPABILITY_SUMMARY`.
 *
 * It describes the **role**, never a person and never what the reader holds,
 * which is the same rule `describeRoleRequirement()` follows and for the same
 * reason: the Roles page is read by anyone who reaches Administration.
 */
export function describeRoleCapabilities(code: string): readonly string[] {
  const held = roleCapabilities(code).map((entry) => entry.action);
  return held.length === 0 ? [NO_CAPABILITY_SUMMARY] : held;
}

/**
 * The tiers this projection walks, strongest first. Not derived from the object
 * key order, so that adding a tier is a decision about where it reads rather
 * than an accident of where it was typed.
 */
const PROTECTED_TIER_ORDER: readonly ProtectedLeadershipTier[] = Object.freeze([
  "standing_continuity",
  "presiding",
]);

/**
 * The one limit every administering seat carries, whatever else it may do.
 *
 * `DEC-no-self-removal`. It is a relation between an actor and a target like
 * the tier rules, but it needs no table: the target is always the actor.
 */
const SELF_ACTION_LIMIT =
  "act on their own account — ending their own role, deactivating themselves, or " +
  "recovering their own address";

/**
 * What a seat that administers operators may **not** do — LAN-141 finding 10.
 *
 * ## Why this exists
 *
 * `describeRoleCapabilities()` answers "what may this seat do", and for the two
 * strongest seats in the club it answered *identically*: General Manager and
 * President hold the same nine grants, so the Permissions panel showed the same
 * nine sentences on both pages — in the mission whose subtlest locked decision
 * (`DEC-two-tier-operating-model`) is that one of them outranks the other. The
 * distinction was enforced everywhere and visible nowhere.
 *
 * It is not new copy. What separates the two seats is already data:
 * {@link PROTECTED_LEADERSHIP_AUTHORITY} says who may manage and who may
 * recover each protected tier, `administration-authority.ts` enforces exactly
 * those lists, and this reads the same lists from the other side — the seats a
 * given code is **absent** from. The reviewed prototype's own negative line
 * ("Cannot remove the General Manager, end their own assignment or deactivate
 * their own account") is what it reconstructs, per seat rather than by hand.
 *
 * Empty for the seventeen seats that do not administer at all: telling a Kit
 * Manager which seats they may not manage would imply they may manage the rest.
 *
 * Phrases are verb phrases with no subject, matching `action` above, so a
 * surface can put one sentence in front of the list.
 */
/**
 * What "management" of a protected seat covers, in the club's words.
 *
 * Every verb here is an action `ADMINISTRATION_TARGET_RULES` classifies
 * `kind: "management"`, and the leadership rule refuses **all** of them to a
 * seat absent from that tier's management list — it branches on the kind, not
 * on the action.
 *
 * The copy used to name four of the seven: "assign, replace, end or deactivate".
 * Restore, resend and correct-invitation were enforced and unmentioned, and the
 * omission read as permission on the panel that exists to say what a seat may
 * not do. A President reading their own page could reasonably infer that
 * re-issuing the General Manager's invitation was open to them — an invitation
 * carries a credential-establishing link, and `correct_invitation` redirects it
 * to an address the administrator chooses, so it is the least safe of the three
 * to be quietly missing.
 *
 * Nothing about who may do what changed with this sentence; the grants, the
 * role lists and `PROTECTED_LEADERSHIP_AUTHORITY` are untouched. This is the
 * enforced table said out loud, and `administration-authority.test.ts` derives
 * the check from that table so a management action added later cannot slip past
 * the copy.
 */
const MANAGEMENT_LIMIT_VERBS =
  "assign, replace or end the role of, deactivate or restore access for, or " +
  "resend or correct an invitation for";

export function describeLeadershipLimits(code: string): readonly string[] {
  if (!CAPABILITIES.role_management.roleCodes.includes(code)) return [];

  const limits: string[] = [];

  for (const tier of PROTECTED_TIER_ORDER) {
    const seat = roleLabel(LEADERSHIP_TIER_SEATS[tier]);
    const authority = PROTECTED_LEADERSHIP_AUTHORITY[tier];
    if (!authority.management.includes(code)) {
      limits.push(`${MANAGEMENT_LIMIT_VERBS} the ${seat}`);
    }
    if (!authority.recovery.includes(code)) {
      limits.push(`recover email access for the ${seat}`);
    }
  }

  limits.push(SELF_ACTION_LIMIT);
  return Object.freeze(limits);
}
