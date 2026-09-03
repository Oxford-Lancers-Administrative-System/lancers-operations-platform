import "server-only";

import { Conflict, ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { generateOnboardingItems } from "./membership";
import { emitOnboardingOpenedWelcomeIn } from "./onboarding-welcome";
import { personDisplayAliasSql } from "./sql-text";

/**
 * Returner intake — the slice's first roster path. LAN-74.
 *
 * ## What this module is for
 *
 * One authorized operator enters a returning player, by hand, on a phone, and
 * the application mints the durable and seasonal identifiers together: a
 * `people` row (or a person the operator explicitly picked), its contact
 * points, and one `season_memberships` row in the open season carrying
 * `entry = 'returning'`.
 *
 * ## The two rules that shape every function here
 *
 * **1. Nothing is written until a human has decided who this is.** Requirement
 * 2 asks for a verified path that dedupes against existing Persons *before*
 * creating anything, and the reason is in the source data: 26% of the current
 * squad is recorded by first name only, and there is no stable join key
 * anywhere in the club's files. So `findPersonCandidates()` is a separate,
 * read-only call, and `enterReturningPlayer()` refuses to guess — it takes an
 * explicit `decision` naming either an existing person or a deliberate new one.
 * There is no code path through this module that creates a person because
 * nothing matched. "Nothing matched" is still an operator's call to make.
 *
 * **2. Contact detail is stored exactly as it was typed.**
 * `docs/architecture/data-model.md` is explicit — "Raw intake is stored
 * unvalidated by design; normalisation is separate and reversible" — and the
 * schema comment on `contact_points.raw_value` says the same. A reversed TLD, a
 * trailing space and a missing leading zero are all real defects in the club's
 * files, and rejecting or silently repairing them loses the contact entirely.
 * So `raw_value` receives the operator's string byte-for-byte. Trimming and
 * case-folding happen **only** to compare, never to store.
 *
 * The one deliberate exception is the name fields, which the database itself
 * constrains to be non-blank and which are identity rather than contact detail;
 * those are trimmed. That asymmetry is intentional and is stated here so it is
 * not "fixed" later.
 *
 * ## Where the transition record lives
 *
 * The membership transition — `null → onboarding`, and since LAN-182 that is
 * the only one an intake writes — is written to
 * `season_membership_status_events`, which is the typed first-class home the
 * frozen model gives it, and it carries the acting operator as
 * `actor_person_id`. It is deliberately **not** duplicated into
 * `audit_events`: register D9 refuses that, the `audit_events` table comment
 * says so, and `recordAudit`'s own documentation repeats it.
 *
 * `audit_events` receives the two facts that have no typed home — that this
 * operator minted a durable identity, and that this operator completed a
 * returner intake and confirmed the membership. Neither carries `from_state` or
 * `to_state`, so neither restates a transition the typed table already owns.
 * `public.transition_ledger` reads both streams as one. This reconciliation is
 * recorded in the pull request; see LAN-74's acceptance criteria.
 */

/** What the operator typed into UX-10. Never mutated, never normalised in place. */
export interface ReturnerIntakeInput {
  givenName: string;
  familyName?: string | null;
  knownAs?: string | null;
  /** Stored verbatim if supplied. Shape-checked only to help the operator. */
  email?: string | null;
  /** Stored verbatim if supplied. Never normalised to E.164 — out of scope. */
  phone?: string | null;
  /**
   * LAN-215, `roster-import.ts`'s own addition to this shared write: the two
   * optional columns the CSV import carries beyond what UX-10's form ever
   * asked for. Written **only** for a person this call mints — see
   * `insertPerson`. UX-10 never supplies either, so this changes nothing
   * about the shipped returner-intake path.
   */
  college?: string | null;
  matriculationYear?: number | null;
}

/** Why a candidate surfaced. Shown to the operator so the choice is informed. */
export type CandidateMatch = "given name" | "family name" | "known as" | "email" | "phone";

/** One possible existing Person, for UX-11. */
export interface PersonCandidate {
  personId: string;
  givenName: string;
  familyName: string | null;
  /** The alias flagged as this person's display name, if they have one. */
  displayAlias: string | null;
  /**
   * An email to show on UX-11: of the person's **current** emails (those with
   * no `valid_until`), the preferred one if there is one, else the most
   * recently recorded. `null` when they have no current email at all — a
   * superseded college address does not appear here.
   *
   * Not strictly "the preferred one" — this module records a supplied contact
   * as *not* preferred when the person already has one of that kind, and a
   * candidate list showing those as "—" would drop the field the operator's
   * decision most depends on.
   */
  email: string | null;
  /** A current phone, on exactly the same rule as `email`. */
  phone: string | null;
  /**
   * Their membership in the open season, when they already hold one.
   *
   * `seasonLabel` is carried so that UX-12 can render its approved sentence —
   * "<name> is already a member for the <season> season" — without a second
   * query, and without the interface inventing a season name of its own.
   */
  currentMembership: { id: string; status: string; seasonLabel: string } | null;
  /** Every field that matched, in a stable order. Never empty. */
  matchedOn: CandidateMatch[];
}

/** The operator's explicit answer to "who is this?". There is no third option. */
export type IntakeDecision =
  { kind: "existing"; personId: string } | { kind: "new"; confirmed: true };

/** What was actually written, for UX-13. */
export interface ReturnerIntakeResult {
  personId: string;
  membershipId: string;
  seasonId: string;
  seasonLabel: string;
  /** True when this submission minted the `people` row. */
  personCreated: boolean;
  /** A display alias was written because the known-as differs from the given name. */
  aliasCreated: boolean;
  /** The contact points this submission wrote, in the order written. */
  contactsRecorded: RecordedContact[];
  confirmedOn: string;
  /**
   * LAN-215, W2's own addition: the welcome queued in the same transaction as
   * the membership. `false` only for the "already queued" idempotent replay
   * this function's own transaction never actually produces (a membership is
   * always freshly created here) — carried as a result field rather than
   * assumed, so a caller reads what happened instead of re-deriving it.
   */
  welcomeQueued: boolean;
}

export interface RecordedContact {
  kind: "email" | "phone";
  /** Exactly as the operator typed it. */
  rawValue: string;
  /**
   * `false` when the person already had a preferred contact of this kind. The
   * existing one is left completely untouched — see `insertContactPoint`.
   */
  isPreferred: boolean;
}

/** The open season every membership in this slice is created in. */
export interface OpenSeason {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Comparison helpers — used to match, never to store
// ---------------------------------------------------------------------------

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The intake input reduced to the values this module is willing to act on.
 *
 * Names are trimmed because they are identity and the database refuses a blank
 * one. `email` and `phone` keep their original string — `raw` is what gets
 * stored — alongside a trimmed copy used only for comparison and shape checks.
 */
interface NormalisedInput {
  givenName: string;
  familyName: string | null;
  knownAs: string | null;
  email: { raw: string; compare: string } | null;
  phone: { raw: string; compare: string } | null;
  college: string | null;
  matriculationYear: number | null;
}

function normaliseInput(input: ReturnerIntakeInput): NormalisedInput {
  const givenName = trimmedOrNull(input.givenName);
  if (!givenName) {
    throw new ConstraintViolated(
      "A first name is required — it is the one name the club always has.",
      {
        rule: "people_given_name_not_blank",
      },
    );
  }

  const email = typeof input.email === "string" && input.email.trim() !== "" ? input.email : null;
  const phone = typeof input.phone === "string" && input.phone.trim() !== "" ? input.phone : null;

  return {
    givenName,
    familyName: trimmedOrNull(input.familyName),
    knownAs: trimmedOrNull(input.knownAs),
    email: email === null ? null : { raw: email, compare: email.trim() },
    phone: phone === null ? null : { raw: phone, compare: phone.trim() },
    college: trimmedOrNull(input.college ?? null),
    matriculationYear: input.matriculationYear ?? null,
  };
}

// ---------------------------------------------------------------------------
// The season
// ---------------------------------------------------------------------------

/**
 * The one season a membership may be created in today.
 *
 * The frozen model calls this "the currently open or active season", and both
 * `open` and `active` are legal here: `open` is a season taking registrations,
 * `active` is one under way, and a returner can be entered in either.
 *
 * It fails closed in both directions. No open season is a `NotFound` telling
 * the operator the season has not been opened yet — not an invitation to pick
 * one. **More than one** is a `Conflict`, because nothing in the schema forbids
 * two seasons being open at once and quietly choosing the newer of them would
 * put a player on the wrong roster with no evidence of the choice.
 */
export async function resolveOpenSeason(tx: Tx): Promise<OpenSeason> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label
       from public.seasons
      where status in ('open', 'active')
      order by label`,
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "There is no open season, so a membership cannot be created yet. " +
        "The President or Secretary opens the season first.",
      { rule: "no_open_season" },
    );
  }

  if (result.rows.length > 1) {
    throw new Conflict(
      "More than one season is currently open, so it is not clear which one this " +
        "membership belongs to. Close or archive the season that has finished, then try again.",
      { rule: "ambiguous_open_season" },
    );
  }

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// The duplicate check
// ---------------------------------------------------------------------------

interface CandidateRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
  email: string | null;
  phone: string | null;
  membership_id: string | null;
  membership_status: string | null;
  season_label: string;
  matched_given: boolean;
  matched_family: boolean;
  matched_known_as: boolean;
  matched_email: boolean;
  matched_phone: boolean;
}

/**
 * Every existing Person who might already be the human being entered.
 *
 * ## What counts as a match, and why it is this loose
 *
 * A given name on its own is enough. That looks over-eager until you read the
 * source data analysis: a quarter of the squad is recorded with a first name
 * and nothing else, so "Bertram, no surname" is exactly the row an operator
 * entering "Bertram Fielding" most needs to see. Requiring a surname to match
 * would hide precisely the duplicates this check exists to catch.
 *
 * The cost of a loose match is a longer list the operator reads; the cost of a
 * tight one is a second Person for someone who already has one, which invariant
 * I6 then makes an audited merge to undo. The asymmetry is the whole argument.
 *
 * Aliases count too, because the club's files already carry "Ben"/"Benjamin"
 * and "A. Ashcombe" for single people, and `person_aliases` is where that is
 * recorded.
 *
 * Phones are compared on their **last nine digits**, so `+44 7700 900101` and
 * `07700 900101` match — the same number written the two ways the club's files
 * actually write it. That comparison never touches what is stored.
 *
 * ## Who is excluded
 *
 * People merged away under invariant I6. Their row is retained forever and
 * points at the survivor, but they are not an identity anybody may be given a
 * new membership as; offering one as a candidate would invite an operator to
 * resurrect a record the club has already decided is a duplicate.
 */
export async function findPersonCandidates(input: ReturnerIntakeInput): Promise<PersonCandidate[]> {
  const normalised = normaliseInput(input);

  return withTransaction(async (tx) => {
    // Resolved first, and deliberately: a candidate is only useful alongside
    // "do they already hold a membership this season?", and an operator who
    // cannot create a membership at all should learn that before typing a
    // second screen of detail rather than after.
    const season = await resolveOpenSeason(tx);

    const result = await tx.query<CandidateRow>(
      `with wanted as (
         select
           lower($1::text)          as given_name,
           lower($2::text)          as family_name,
           lower($3::text)          as known_as,
           lower($4::text)          as email,
           nullif(right(regexp_replace(coalesce($5::text, ''), '\\D', '', 'g'), 9), '') as phone_tail
       ),
       alias_match as (
         select a.person_id,
                bool_or(lower(btrim(a.alias)) = w.given_name)  as by_given,
                bool_or(lower(btrim(a.alias)) = w.family_name) as by_family,
                bool_or(lower(btrim(a.alias)) = w.known_as)    as by_known_as
           from public.person_aliases a
           cross join wanted w
          group by a.person_id
       ),
       contact_match as (
         select c.person_id,
                bool_or(c.kind = 'email' and lower(btrim(c.raw_value)) = w.email) as by_email,
                bool_or(
                  c.kind = 'phone'
                  and w.phone_tail is not null
                  and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '') = w.phone_tail
                ) as by_phone
           from public.contact_points c
           cross join wanted w
          group by c.person_id
       ),
       -- The contact values shown on UX-11. Preferred first, then anything
       -- current — because this module now records a supplied contact as
       -- *not* preferred when the person already has one of that kind, and a
       -- candidate list that showed those as "—" would drop the field the
       -- operator's decision most depends on.
       preferred as (
         select distinct on (person_id, kind) person_id, kind, raw_value
           from public.contact_points
          where valid_until is null
          order by person_id, kind, is_preferred desc, created_at desc
       ),
       display_contact as (
         select person_id,
                max(raw_value) filter (where kind = 'email') as email,
                max(raw_value) filter (where kind = 'phone') as phone
           from preferred
          group by person_id
       )
       select
         p.id                                             as person_id,
         p.given_name,
         p.family_name,
         ${personDisplayAliasSql("p")}                     as display_alias,
         display_contact.email,
         display_contact.phone,
         m.id                                             as membership_id,
         m.status::text                                   as membership_status,
         $7::text                                         as season_label,
         -- btrim on the stored side as well as the typed side. Names are
         -- stored as intake received them, and people_given_name_not_blank
         -- only forbids an all-whitespace value — so ' Bertram ' is a legal
         -- row, and an import will eventually produce one. Comparing it
         -- untrimmed hides exactly the duplicate this check exists to find.
         coalesce(lower(btrim(p.given_name)) = w.given_name
                  or am.by_given, false)                  as matched_given,
         coalesce(lower(btrim(p.family_name)) = w.family_name
                  or am.by_family, false)                 as matched_family,
         -- No known-as arm any more, and nothing is lost by its absence:
         -- LAN-182 moved that value into person_aliases, which the alias_match
         -- CTE above already scans. What the struck column used to catch,
         -- am.by_known_as and am.by_given now catch from where it actually is.
         coalesce(lower(btrim(p.given_name)) = w.known_as
                  or am.by_known_as, false)               as matched_known_as,
         coalesce(cm.by_email, false)                     as matched_email,
         coalesce(cm.by_phone, false)                     as matched_phone
       from public.people p
       cross join wanted w
       left join alias_match   am on am.person_id = p.id
       left join contact_match cm on cm.person_id = p.id
       left join display_contact  on display_contact.person_id = p.id
       left join public.season_memberships m
              on m.person_id = p.id and m.season_id = $6::uuid
      where p.merged_into_person_id is null
        and (
          lower(btrim(p.given_name)) = w.given_name
          or lower(btrim(p.family_name)) = w.family_name
          or lower(btrim(p.given_name)) = w.known_as
          or coalesce(am.by_given or am.by_family or am.by_known_as, false)
          or coalesce(cm.by_email or cm.by_phone, false)
        )
      order by p.family_name nulls last, p.given_name, p.id`,
      [
        normalised.givenName,
        normalised.familyName,
        normalised.knownAs,
        normalised.email?.compare ?? null,
        normalised.phone?.compare ?? null,
        season.id,
        season.label,
      ],
    );

    return result.rows.map(toCandidate);
  });
}

function toCandidate(row: CandidateRow): PersonCandidate {
  const matchedOn: CandidateMatch[] = [];
  if (row.matched_given) matchedOn.push("given name");
  if (row.matched_family) matchedOn.push("family name");
  if (row.matched_known_as) matchedOn.push("known as");
  if (row.matched_email) matchedOn.push("email");
  if (row.matched_phone) matchedOn.push("phone");

  return {
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    displayAlias: row.display_alias,
    email: row.email,
    phone: row.phone,
    currentMembership:
      row.membership_id && row.membership_status
        ? { id: row.membership_id, status: row.membership_status, seasonLabel: row.season_label }
        : null,
    matchedOn,
  };
}

// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

/**
 * Records one returning player, in one transaction.
 *
 * Everything below commits together or not at all: the person, the alias, both
 * contact points, the membership, both status-history rows and both audit
 * rows. A failure at any statement leaves nothing behind — not a person without
 * a membership, and not a membership whose history is missing its first
 * transition.
 *
 * The status sequence is the frozen model's §2.1 machine as LAN-182 rebuilt it,
 * and is not the operator's to choose. A membership now begins at `onboarding`
 * and nowhere else. The old sequence walked `carried_forward → confirmed`, and
 * both of those map onto `onboarding`: writing it today would record two
 * transitions from a state to itself, which is a history asserting changes that
 * did not happen. What distinguishes a returner from a new player is `entry`,
 * which is where that fact always lived.
 *
 * `actorPersonId` is the `personId` from `resolveOperator()`. It is a required
 * argument and is never defaulted — see `src/lib/services/README.md` rule 1.
 */
export async function enterReturningPlayer(params: {
  actorPersonId: string;
  input: ReturnerIntakeInput;
  decision: IntakeDecision;
}): Promise<ReturnerIntakeResult> {
  const { actorPersonId, decision } = params;
  const input = normaliseInput(params.input);

  if (!trimmedOrNull(actorPersonId)) {
    throw new ConstraintViolated("A returner intake must name the operator who performed it.", {
      rule: "audit_events_has_an_actor",
    });
  }

  return withTransaction(async (tx) => {
    const season = await resolveOpenSeason(tx);

    const personId =
      decision.kind === "existing"
        ? await requireExistingPerson(tx, decision.personId)
        : await insertPerson(tx, input);
    const personCreated = decision.kind === "new";

    // Invariant I2, checked here so the operator gets UX-12's sentence rather
    // than an integrity error. The unique constraint underneath is still the
    // guarantee — this check can lose a race with a concurrent submission, and
    // when it does, `mapDatabaseError` turns
    // `season_memberships_one_per_person_per_season` into the same refusal.
    if (!personCreated) await refuseExistingMembership(tx, personId, season);

    // Only for a person this submission minted. Appending a name form to an
    // existing person's alias history from an intake form would be editing a
    // record the operator did not ask to edit — and because
    // `findPersonCandidates` matches on aliases, a mistyped "Known as" would
    // permanently widen that person's future duplicate matching.
    const aliasCreated = personCreated ? await insertAliasIfDistinct(tx, personId, input) : false;
    const contactsRecorded = await insertContactPoints(tx, personId, input);

    const confirmedOn = await currentDate(tx);
    const membershipId = await insertMembership(tx, {
      personId,
      seasonId: season.id,
      confirmedOn,
    });

    // The transition record, in its typed home. One row, because one thing
    // happened: this person now holds a membership and is working through
    // onboarding.
    await recordStatusEvent(
      tx,
      membershipId,
      null,
      "onboarding",
      actorPersonId,
      "Returner verification completed (operator entry)",
    );

    // Frozen model §2.1: confirmation is what generates the season's onboarding
    // items. LAN-75 owns the rule and the function; the call belongs here
    // because this is the only place in the application where a membership
    // becomes `confirmed`, and generating them one screen later would leave the
    // operator activating a membership whose items they never got to resolve.
    //
    // In the same transaction as the confirmation it describes, so a rolled-back
    // intake cannot leave orphan items behind. Idempotent, so a season with no
    // configured types is a no-op rather than a failure.
    await generateOnboardingItems(tx, membershipId, season.id);

    // LAN-215, `REQ-one-welcome`: the welcome queued in the same transaction
    // as the membership and the checklist — W2's own addition, and the one
    // thing that used to distinguish "the surface exists" from "the surface
    // opens onto onboarding". A person who has explicitly refused or
    // withdrawn messaging consent throws here (`InvalidTransition`), and the
    // whole transaction rolls back with them — "a person on the roster who
    // was never told" is the failure this exists to prevent, matching W2's
    // own exceptions table.
    const welcome = await emitOnboardingOpenedWelcomeIn(tx, {
      membershipId,
      personId,
      seasonId: season.id,
    });

    if (personCreated) {
      await recordAudit(tx, {
        actorPersonId,
        action: "person_created",
        entityTable: "people",
        entityId: personId,
        reason: "Operator confirmed this is a person the club has no record of.",
        context: {
          issue: "LAN-74",
          via: "returner_intake",
          dedupe_decision: "new_person",
          contact_kinds_recorded: contactsRecorded.map((contact) => contact.kind),
          alias_recorded: aliasCreated,
        },
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "returner_membership_confirmed",
      entityTable: "season_memberships",
      entityId: membershipId,
      reason: "Returning player entered by an operator.",
      context: {
        issue: "LAN-74",
        person_id: personId,
        season_id: season.id,
        season_label: season.label,
        entry: "returning",
        dedupe_decision: personCreated ? "new_person" : "existing_person",
        person_created: personCreated,
        // The transitions themselves live in season_membership_status_events;
        // this names where to read them rather than restating them (D9).
        transitions_recorded_in: "season_membership_status_events",
      },
    });

    return {
      personId,
      membershipId,
      seasonId: season.id,
      seasonLabel: season.label,
      personCreated,
      aliasCreated,
      contactsRecorded,
      confirmedOn,
      welcomeQueued: welcome.queued,
    };
  });
}

/** `current_date` from the database, so every date in one transaction agrees. */
async function currentDate(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>(
    "select to_char(current_date, 'YYYY-MM-DD') as today",
  );
  return result.rows[0].today;
}

/**
 * The person the operator picked, confirmed to still exist and not to have been
 * merged away since the candidate list was drawn.
 */
async function requireExistingPerson(tx: Tx, personId: string): Promise<string> {
  const result = await tx.query<{ id: string; merged_into_person_id: string | null }>(
    "select id, merged_into_person_id from public.people where id = $1::uuid",
    [personId],
  );

  const person = result.rows[0];
  if (!person) {
    throw new NotFound(
      "That person is no longer on record. Run the duplicate check again and choose from the current list.",
      { rule: "person_not_found" },
    );
  }
  if (person.merged_into_person_id) {
    throw new Conflict(
      "That record has been merged into another person, so a new membership cannot be " +
        "created against it. Run the duplicate check again and choose the surviving record.",
      { rule: "person_merged_away" },
    );
  }
  return person.id;
}

/** UX-12: the person already holds a membership in this season (invariant I2). */
async function refuseExistingMembership(
  tx: Tx,
  personId: string,
  season: OpenSeason,
): Promise<void> {
  const result = await tx.query<{ id: string }>(
    "select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid",
    [personId, season.id],
  );

  if (result.rows.length > 0) {
    // `rule` carries the constraint name deliberately: it is the same name the
    // database would report if this check lost a race to a concurrent
    // submission, so a caller matching on `rule` handles both routes to this
    // refusal with one branch. The membership's id is not smuggled into
    // `context` — that type is for driver detail — and the caller already has
    // it from the candidate list it drew.
    throw new Conflict(
      `This person already has a membership for the ${season.label} season. ` +
        "No duplicate membership was created, and nothing else was changed.",
      { rule: "season_memberships_one_per_person_per_season" },
    );
  }
}

async function insertPerson(tx: Tx, input: NormalisedInput): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name, college, matriculation_year)
     values ($1, $2, $3, $4)
     returning id`,
    [input.givenName, input.familyName, input.college, input.matriculationYear],
  );
  return result.rows[0].id;
}

/**
 * Records the typed known-as as the person's display alias, when it is a
 * genuinely different name form.
 *
 * This is where LAN-182's collapse lands: known-as is no longer a column of its
 * own, it is an alias flagged `is_display_name`. One row now carries both jobs
 * — the name the club uses on screen, and the name a later import matches on.
 *
 * The seeded data has people whose known-as simply repeats the given name;
 * writing that as an alias adds a row that says nothing. A name the club
 * actually uses instead — "Ben" for "Benjamin" — is exactly what
 * `person_aliases` is for, and is what makes a later import match this person
 * without promoting a name to a key.
 *
 * Only for a newly created person. An existing person's alias history belongs
 * to whoever recorded it, and quietly appending to it from an intake form would
 * be editing a record the operator did not ask to edit.
 */
async function insertAliasIfDistinct(
  tx: Tx,
  personId: string,
  input: NormalisedInput,
): Promise<boolean> {
  const knownAs = input.knownAs;
  if (!knownAs) return false;
  if (knownAs.toLowerCase() === input.givenName.toLowerCase()) return false;

  const result = await tx.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, 'operator intake', true)
     on conflict (person_id, alias) do nothing
     returning id`,
    [personId, knownAs],
  );
  return result.rowCount === 1;
}

async function insertContactPoints(
  tx: Tx,
  personId: string,
  input: NormalisedInput,
): Promise<RecordedContact[]> {
  const recorded: RecordedContact[] = [];
  if (input.email) recorded.push(await insertContactPoint(tx, personId, "email", input.email.raw));
  if (input.phone) recorded.push(await insertContactPoint(tx, personId, "phone", input.phone.raw));
  return recorded;
}

/**
 * One contact point, stored exactly as typed.
 *
 * `normalised_value` is left null on purpose. Normalisation is a separate,
 * reversible step the data model deliberately keeps apart from intake, and
 * filling it in here would make this function the place a phone format policy
 * lives — which is explicitly out of LAN-74's scope.
 *
 * ## Why `is_preferred` is conditional
 *
 * `contact_points_one_preferred_per_kind` is a partial unique index: a person
 * may hold exactly one preferred email and one preferred phone at a time. When
 * the operator picks an **existing** person who already has a preferred contact
 * of this kind, this records the new value as *not* preferred rather than
 * demoting the old one.
 *
 * That is the conservative direction on purpose. Superseding a contact is a
 * real operation with real consequences — it is what the club will send an RSVP
 * link to — and an intake form is not where somebody's known-good phone number
 * gets replaced by a number typed from memory. The old value is untouched, the
 * new value is on record, and a later screen with an explicit "make this the
 * preferred number" action can promote it. The confirmation screen says which
 * happened so the operator is never left believing they changed something they
 * did not.
 *
 * A value already recorded for this person under the same kind is not written
 * twice.
 */
async function insertContactPoint(
  tx: Tx,
  personId: string,
  kind: "email" | "phone",
  rawValue: string,
): Promise<RecordedContact> {
  const existing = await tx.query<{ is_preferred: boolean; same_value: boolean }>(
    `select is_preferred,
            lower(btrim(raw_value)) = lower(btrim($3::text)) as same_value
       from public.contact_points
      where person_id = $1::uuid and kind = $2::public.contact_point_kind`,
    [personId, kind, rawValue],
  );

  const alreadyRecorded = existing.rows.find((row) => row.same_value);
  if (alreadyRecorded) {
    return { kind, rawValue, isPreferred: alreadyRecorded.is_preferred };
  }

  const isPreferred = !existing.rows.some((row) => row.is_preferred);

  await tx.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3, $4, 'operator intake')`,
    [personId, kind, rawValue, isPreferred],
  );

  return { kind, rawValue, isPreferred };
}

async function insertMembership(
  tx: Tx,
  params: { personId: string; seasonId: string; confirmedOn: string },
): Promise<string> {
  // `onboarding`, which is where every membership starts under the five-value
  // ladder. `confirmed_on` still carries the day the club said yes — that is a
  // milestone date, and it survived the vocabulary change that struck the state
  // of the same name.
  const result = await tx.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'returning', $3::date)
     returning id`,
    [params.personId, params.seasonId, params.confirmedOn],
  );
  return result.rows[0].id;
}

async function recordStatusEvent(
  tx: Tx,
  membershipId: string,
  fromStatus: string | null,
  toStatus: string,
  actorPersonId: string,
  reason: string | null = null,
): Promise<void> {
  await tx.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.membership_status, $3::public.membership_status, $4::uuid, $5)`,
    [membershipId, fromStatus, toStatus, actorPersonId, reason],
  );
}
