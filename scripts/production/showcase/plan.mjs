/**
 * The tester-week dataset, as a list of rows — LAN-221 (extending LAN-124).
 *
 * A pure function. It takes the term card (read from the club's workbook, or
 * synthesised), the private parameters Brian supplies at execution time, and
 * what the target already holds, and returns every row the load would write,
 * in dependency order, each with the provenance that put it there and the
 * **data states** it exists to demonstrate. It opens no connection and reads
 * no environment.
 *
 * That purity is what makes the preview trustworthy and the checklists
 * honest: `showcase preview` prints *this* plan, `showcase load` writes *this*
 * plan, `showcase verify` counts *this* plan's states, and `showcase
 * checklists` writes links to *this* plan's identifiers — before anything has
 * been loaded.
 *
 * ## Two kinds of row
 *
 * **source-derived** — a faithful transformation of the Michaelmas term card,
 * when a workbook was supplied. **illustrative** — everything else: forty
 * invented players, fourteen invented recruits, a term of invented events and
 * the messaging that "was sent" about them. Nothing here corresponds to a
 * member of the club (Brian, 2026-09-03), and every contact value is in a
 * reserved, non-deliverable range.
 *
 * ## Modules
 *
 * `plan/reference.mjs` seasons, vocabulary, seats, operators, item types
 * `plan/people.mjs`    the squad, their contacts, memberships and history
 * `plan/recruitment.mjs` the funnel
 * `plan/calendar.mjs`  events, audiences, answers, registers, the ladder
 * `plan/onboarding.mjs` the checklist, its history, its documents, disputes
 * `plan/audit.mjs`     the audit trail behind all of it
 */

import { createContext } from "./plan/context.mjs";
import { buildReference, CURRENT_SEASON_LABEL, ARCHIVED_SEASON_LABEL } from "./plan/reference.mjs";
import { buildPeople } from "./plan/people.mjs";
import { buildRecruitment } from "./plan/recruitment.mjs";
import { buildCalendar } from "./plan/calendar.mjs";
import { buildOnboarding } from "./plan/onboarding.mjs";
import { buildAudit } from "./plan/audit.mjs";
import { signupCode } from "./ids.mjs";

export { CURRENT_SEASON_LABEL, ARCHIVED_SEASON_LABEL };

/** A database with no reference data at all — which a fresh hosted project is. */
const EMPTY_EXISTING = Object.freeze({ openCommitteeYear: null });

/** Today, in the club's own timezone, as the default anchor. */
export function todayInLondon(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Builds the whole plan.
 *
 * @param {object} input
 * @param {Array}  input.termCard   from `readTermCard` or `syntheticTermCard`
 * @param {object} input.params     Brian's private parameters
 * @param {object} [input.existing] from `readExisting` — reference data to adopt
 * @param {string} [input.anchor]   the tester-week date everything is placed around
 */
export function buildPlan({
  termCard,
  params,
  existing = EMPTY_EXISTING,
  anchor = todayInLondon(),
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor))
    throw new Error(`The anchor must be a date, not ${anchor}.`);

  const labels = {
    currentSeason: params.labels?.currentSeason ?? CURRENT_SEASON_LABEL,
    archivedSeason: params.labels?.archivedSeason ?? ARCHIVED_SEASON_LABEL,
    vocabularyCode: params.labels?.vocabularyCode ?? "oulafc_2026",
    seasonStatus: params.labels?.seasonStatus ?? "active",
  };

  const ctx = createContext({ params, existing, anchor, labels });
  ctx.signupCode = (...parts) => signupCode(labels.currentSeason, ...parts);

  // Fixed vocabulary a route can name directly.
  for (const type of [
    "practice",
    "strength_and_conditioning",
    "chalk",
    "game",
    "social",
    "recruitment",
    "meeting",
  ])
    ctx.example(`type.${type}`, type);

  const reference = buildReference(ctx, { termCard });
  const people = buildPeople(ctx, reference);
  const recruitment = buildRecruitment(ctx, reference, people);
  const calendar = buildCalendar(ctx, reference, people, recruitment.recruits, { termCard });
  const onboarding = buildOnboarding(ctx, reference, people, recruitment);
  buildAudit(ctx, reference, people, recruitment, calendar);

  return {
    rows: ctx.rows,
    provenance: ctx.provenance,
    states: ctx.states,
    examples: ctx.examples,
    byTable: ctx.byTable,
    notes: reference.notes,
    context: {
      anchor,
      labels,
      seasonId: reference.seasonId,
      archivedSeasonId: reference.archivedSeasonId,
      termId: reference.termId,
      actorPersonId: reference.actorPersonId,
      presidentId: reference.presidentId,
      operators: reference.operators,
      players: people.players,
      recruits: recruitment.recruits,
      events: calendar.events,
      memberships: onboarding.memberships,
      liveLinksFor: params.liveLinksFor ?? ["brian", "stewart"],
    },
  };
}
