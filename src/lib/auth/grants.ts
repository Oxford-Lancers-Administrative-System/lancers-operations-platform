/**
 * The grant vocabulary — LAN-429, mission M-GRANULAR-ROLES-AND-PERMISSIONS
 * (parent LAN-423).
 *
 * What a seat may see and change is data in `public.role_access_grants`, one
 * row per (seat, line), edited on the seat page. This module is the one place
 * the vocabulary of those rows is written in TypeScript, and the one place an
 * operator's effective access is computed from them. It is pure: no database,
 * no framework, safe in a client bundle.
 *
 * ## The four kinds of line
 *
 * | kind (`subject_kind`)  | subject                       | levels, lowest first      |
 * | ---------------------- | ----------------------------- | ------------------------- |
 * | `roster_category`      | one of {@link ROSTER_CATEGORIES}    | `none` `view` `edit` (`attendance`: `none` `view`) |
 * | `recruiting_category`  | one of {@link RECRUITING_CATEGORIES} | `none` `view` `edit` (`recruit_events`: `none` `view`) |
 * | `event_template`       | an `event_templates.id`       | `none` `view` `manage`    |
 * | `switch`               | one of {@link ACCESS_SWITCHES}      | `none` `yes`              |
 *
 * ## Resolution
 *
 * An operator holding several seats holds, on every line, the highest level
 * any of their current seats holds ({@link mergeGrantRows}). A line with no row
 * reads as `none`. `resolveOperatorAccess` (`./operator.ts`) does this once per
 * request and carries the result on `ResolvedOperator.grants`.
 *
 * ## Asking a question of the snapshot
 *
 * - One line: `grantAtLeast(operator.grants, { kind: "roster", key: "kit" }, "edit")`.
 * - A server action: `const operator = await requireGrant({ kind: "template", templateId }, "manage")`
 *   (`./guards.ts`) — refuses with `NotPermitted`.
 * - A page: `gateShellPage(route, { anyOf: "roster", minimum: "view" })` (`src/app/operate/gate.tsx`),
 *   or any {@link GrantRule} / capability mixture (`AccessRule`, `./access.ts`).
 *
 * ## The floor
 *
 * `FIXED_ACCESS_SEATS` (`./capabilities.ts`, the only module that may name a
 * seat) — President, General Manager, IT Officer — hold every line at its
 * maximum and no write may change them. That is a service rule
 * (`src/lib/services/access-grants.ts`), not a row. `seededGrantsFor` there
 * builds the seeded snapshot for a set of role codes, for tests.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The twelve roster categories: the board's ten groups plus Contact &
 * emergency and Attendance. Snake case, as stored; the board's `Band` for
 * special teams is `specialTeams`.
 *
 * - `person` — Person: who they are, name, college, standing.
 * - `contact_emergency` — Contact & emergency: mobile phone, personal email,
 *   emergency contact. No board columns of its own.
 * - `onboarding` — Onboarding (and the record's Onboarding activity).
 * - `membership` — Membership (and Their other seasons, Status history).
 * - `availability` — Availability.
 * - `coaching` — Coaching.
 * - `offensive` — Offensive.
 * - `defensive` — Defensive.
 * - `special_teams` — Special teams.
 * - `warmup` — Warmup.
 * - `kit` — Kit.
 * - `attendance` — Attendance: the player record's Attendance section, and
 *   nothing else (LAN-423 round 6). At most `view`. No board columns; event
 *   attendance recording keeps its own capabilities.
 */
export const ROSTER_CATEGORIES = Object.freeze([
  "person",
  "contact_emergency",
  "onboarding",
  "membership",
  "availability",
  "coaching",
  "offensive",
  "defensive",
  "special_teams",
  "warmup",
  "kit",
  "attendance",
] as const);

export type RosterCategory = (typeof ROSTER_CATEGORIES)[number];

/** The roster categories that are not a board group: no colour, no board columns. */
type NonGroupCategory = "contact_emergency" | "attendance";

/**
 * The ten roster groups that carry a colour (`public.roster_group_colours`):
 * every roster category except Contact & emergency, whose record section
 * wears Person's colour, and Attendance, whose section keeps its own.
 */
export const ROSTER_GROUP_KEYS = Object.freeze(
  ROSTER_CATEGORIES.filter(
    (category) => category !== "contact_emergency" && category !== "attendance",
  ),
) as readonly Exclude<RosterCategory, NonGroupCategory>[];

export type RosterGroupKey = Exclude<RosterCategory, NonGroupCategory>;

/**
 * The three recruiting categories.
 *
 * - `recruit_person` — Person information: the recruit's person columns and
 *   record sections.
 * - `recruit_details` — Recruit details: status, notes, questionnaire,
 *   consent, what changed.
 * - `recruit_events` — Event details: the event bands. At most `view`.
 */
export const RECRUITING_CATEGORIES = Object.freeze([
  "recruit_person",
  "recruit_details",
  "recruit_events",
] as const);

export type RecruitingCategory = (typeof RECRUITING_CATEGORIES)[number];

/**
 * The two switches.
 *
 * - `add_to_roster` — may add players to the roster (Add players).
 * - `add_recruits` — may add recruits (Add recruit, QR code).
 */
export const ACCESS_SWITCHES = Object.freeze(["add_to_roster", "add_recruits"] as const);

export type AccessSwitch = (typeof ACCESS_SWITCHES)[number];

/** A roster or recruiting category's level. */
export type CategoryLevel = "none" | "view" | "edit";
/** An event template's level. `view` shows the event and everything in it; `manage` adds every change. */
export type TemplateLevel = "none" | "view" | "manage";
/** A switch's level. */
export type SwitchLevel = "none" | "yes";
/** Any level, of any kind. */
export type GrantLevel = CategoryLevel | TemplateLevel | SwitchLevel;

/** Lowest first. A level's index is its rank; a higher rank implies every lower one. */
export const CATEGORY_LEVELS: readonly CategoryLevel[] = Object.freeze(["none", "view", "edit"]);
export const TEMPLATE_LEVELS: readonly TemplateLevel[] = Object.freeze(["none", "view", "manage"]);
export const SWITCH_LEVELS: readonly SwitchLevel[] = Object.freeze(["none", "yes"]);
/** `recruit_events` and `attendance` stop at `view`. */
export const RECRUIT_EVENTS_LEVELS: readonly CategoryLevel[] = Object.freeze(["none", "view"]);

/** Whether a category line stops at `view`: Event details and Attendance. */
function stopsAtView(subject: GrantSubject): boolean {
  return (
    (subject.kind === "recruiting" && subject.key === "recruit_events") ||
    (subject.kind === "roster" && subject.key === "attendance")
  );
}

/** The four `subject_kind` values, as stored. */
export type GrantSubjectKind =
  "roster_category" | "recruiting_category" | "event_template" | "switch";

/**
 * One line, as code names it.
 *
 * - `{ kind: "roster", key }` — a roster category.
 * - `{ kind: "recruiting", key }` — a recruiting category.
 * - `{ kind: "template", templateId }` — one event template, by `event_templates.id`.
 * - `{ kind: "switch", key }` — a switch.
 */
export type GrantSubject =
  | { readonly kind: "roster"; readonly key: RosterCategory }
  | { readonly kind: "recruiting"; readonly key: RecruitingCategory }
  | { readonly kind: "template"; readonly templateId: string }
  | { readonly kind: "switch"; readonly key: AccessSwitch };

/** The group a subject belongs to, for "any line of this group" questions. */
export type GrantGroup = GrantSubject["kind"];

/** The level type that belongs to a subject. */
export type LevelFor<S extends GrantSubject> = S extends { kind: "template" }
  ? TemplateLevel
  : S extends { kind: "switch" }
    ? SwitchLevel
    : CategoryLevel;

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

/**
 * An operator's effective access for one request: the union-maximum over
 * every current seat. Every roster, recruiting and switch key is present;
 * `templates` holds only templates at least one seat has a row for — read a
 * template through {@link templateLevel}, which answers `none` for a missing
 * key.
 */
export interface OperatorGrants {
  readonly roster: Readonly<Record<RosterCategory, CategoryLevel>>;
  readonly recruiting: Readonly<Record<RecruitingCategory, CategoryLevel>>;
  /** Keyed by `event_templates.id`. */
  readonly templates: Readonly<Record<string, TemplateLevel>>;
  readonly switches: Readonly<Record<AccessSwitch, SwitchLevel>>;
}

function allAt<K extends string, L>(keys: readonly K[], level: (key: K) => L): Record<K, L> {
  return Object.fromEntries(keys.map((key) => [key, level(key)])) as Record<K, L>;
}

/** Nothing granted: every line `none`. What an operator with no seat holds. */
export const NO_GRANTS: OperatorGrants = Object.freeze({
  roster: Object.freeze(allAt(ROSTER_CATEGORIES, () => "none" as CategoryLevel)),
  recruiting: Object.freeze(allAt(RECRUITING_CATEGORIES, () => "none" as CategoryLevel)),
  templates: Object.freeze({}),
  switches: Object.freeze(allAt(ACCESS_SWITCHES, () => "none" as SwitchLevel)),
});

/** The highest level a line admits. */
export function maximumLevel(subject: GrantSubject): GrantLevel {
  switch (subject.kind) {
    case "roster":
    case "recruiting":
      return stopsAtView(subject) ? "view" : "edit";
    case "template":
      return "manage";
    case "switch":
      return "yes";
  }
}

/** The levels a line admits, lowest first. */
export function levelsFor(subject: GrantSubject): readonly GrantLevel[] {
  switch (subject.kind) {
    case "roster":
    case "recruiting":
      return stopsAtView(subject) ? RECRUIT_EVENTS_LEVELS : CATEGORY_LEVELS;
    case "template":
      return TEMPLATE_LEVELS;
    case "switch":
      return SWITCH_LEVELS;
  }
}

/** Every line at its maximum, for the given templates. What a fixed seat holds, and what Grant everything writes. */
export function fullGrants(templateIds: readonly string[]): OperatorGrants {
  return Object.freeze({
    roster: Object.freeze(
      allAt(ROSTER_CATEGORIES, (key): CategoryLevel => (key === "attendance" ? "view" : "edit")),
    ),
    recruiting: Object.freeze(
      allAt(RECRUITING_CATEGORIES, (key): CategoryLevel =>
        key === "recruit_events" ? "view" : "edit",
      ),
    ),
    templates: Object.freeze(allAt(templateIds, () => "manage" as TemplateLevel)),
    switches: Object.freeze(allAt(ACCESS_SWITCHES, () => "yes" as SwitchLevel)),
  });
}

/** A line's rank among its own levels; an unknown value ranks as `none`. */
export function levelRank(subject: GrantSubject, level: string): number {
  const rank = (levelsFor(subject) as readonly string[]).indexOf(level);
  return rank < 0 ? 0 : rank;
}

/** Whether `level` is a value the line admits. */
export function isLevelFor(subject: GrantSubject, level: unknown): level is GrantLevel {
  return typeof level === "string" && (levelsFor(subject) as readonly string[]).includes(level);
}

/** The level a template holds in a snapshot — `none` when no seat has a row for it. */
export function templateLevel(grants: OperatorGrants, templateId: string): TemplateLevel {
  return grants.templates[templateId] ?? "none";
}

/** The level one line holds in a snapshot. */
export function grantLevel(grants: OperatorGrants, subject: GrantSubject): GrantLevel {
  switch (subject.kind) {
    case "roster":
      return grants.roster[subject.key] ?? "none";
    case "recruiting":
      return grants.recruiting[subject.key] ?? "none";
    case "template":
      return templateLevel(grants, subject.templateId);
    case "switch":
      return grants.switches[subject.key] ?? "none";
  }
}

/**
 * Whether a snapshot holds `subject` at `minimum` or above. The one question
 * every grant check reduces to. A `minimum` the line does not admit (`manage`
 * on a roster category) is never met.
 */
export function grantAtLeast<S extends GrantSubject>(
  grants: OperatorGrants,
  subject: S,
  minimum: LevelFor<S>,
): boolean {
  if (!isLevelFor(subject, minimum)) return false;
  return levelRank(subject, grantLevel(grants, subject)) >= levelRank(subject, minimum);
}

/** Every line of a group in a snapshot, as subjects (templates: those the snapshot names). */
export function subjectsOf(grants: OperatorGrants, group: GrantGroup): GrantSubject[] {
  switch (group) {
    case "roster":
      return ROSTER_CATEGORIES.map((key) => ({ kind: "roster", key }));
    case "recruiting":
      return RECRUITING_CATEGORIES.map((key) => ({ kind: "recruiting", key }));
    case "template":
      return Object.keys(grants.templates).map((templateId) => ({ kind: "template", templateId }));
    case "switch":
      return ACCESS_SWITCHES.map((key) => ({ kind: "switch", key }));
  }
}

/** Whether any line of the snapshot is above `none`. False means the operator holds no grant at all. */
export function holdsAnyGrant(grants: OperatorGrants): boolean {
  return (["roster", "recruiting", "template", "switch"] as const).some((group) =>
    subjectsOf(grants, group).some(
      (subject) => levelRank(subject, grantLevel(grants, subject)) > 0,
    ),
  );
}

/** The templates a snapshot holds at `minimum` or above, as ids. */
export function templatesAtLeast(grants: OperatorGrants, minimum: TemplateLevel): string[] {
  const floor = TEMPLATE_LEVELS.indexOf(minimum);
  return Object.entries(grants.templates)
    .filter(([, level]) => TEMPLATE_LEVELS.indexOf(level) >= floor)
    .map(([templateId]) => templateId);
}

// ---------------------------------------------------------------------------
// Rules: the questions a gate asks
// ---------------------------------------------------------------------------

/**
 * A requirement over grants alone.
 *
 * - `{ subject, minimum }` — this one line at `minimum` or above.
 * - `{ anyOf: group, minimum }` — at least one line of the group at `minimum`
 *   or above (Roster in the sidebar: `{ anyOf: "roster", minimum: "view" }`).
 * - `{ everyOf: group, minimum }` — every line of the group at `minimum` or
 *   above; a line whose maximum is lower (`recruit_events` or `attendance`
 *   under `edit`) is held to its own maximum.
 * - `{ all: [...] }` — every rule in the list.
 */
export type GrantRule =
  | { readonly subject: GrantSubject; readonly minimum: GrantLevel }
  | { readonly anyOf: GrantGroup; readonly minimum: GrantLevel }
  | { readonly everyOf: Exclude<GrantGroup, "template">; readonly minimum: GrantLevel }
  | { readonly all: readonly GrantRule[] };

function atLeastClamped(grants: OperatorGrants, subject: GrantSubject, minimum: GrantLevel) {
  const levels = levelsFor(subject) as readonly string[];
  const wanted = levels.includes(minimum)
    ? levels.indexOf(minimum)
    : // A minimum this line does not name: the line's own maximum stands in for it.
      levels.length - 1;
  return levelRank(subject, grantLevel(grants, subject)) >= wanted;
}

/** Whether a snapshot satisfies a {@link GrantRule}. */
export function grantRuleHolds(grants: OperatorGrants, rule: GrantRule): boolean {
  if ("all" in rule) return rule.all.every((inner) => grantRuleHolds(grants, inner));
  if ("subject" in rule) {
    return grantAtLeast(grants, rule.subject, rule.minimum as LevelFor<typeof rule.subject>);
  }
  if ("anyOf" in rule) {
    return subjectsOf(grants, rule.anyOf).some((subject) =>
      grantAtLeast(grants, subject, rule.minimum as LevelFor<typeof subject>),
    );
  }
  return subjectsOf(grants, rule.everyOf).every((subject) =>
    atLeastClamped(grants, subject, rule.minimum),
  );
}

/** A stable, log-friendly name for a rule — the `rule` of the `NotPermitted` it produces. */
export function grantRuleKey(rule: GrantRule): string {
  if ("all" in rule) return rule.all.map(grantRuleKey).join("&");
  if ("subject" in rule) return `grant:${subjectKey(rule.subject)}>=${rule.minimum}`;
  if ("anyOf" in rule) return `grant:any(${rule.anyOf})>=${rule.minimum}`;
  return `grant:every(${rule.everyOf})>=${rule.minimum}`;
}

/** `roster.kit`, `recruiting.recruit_details`, `template.<id>`, `switch.add_recruits`. */
export function subjectKey(subject: GrantSubject): string {
  return subject.kind === "template"
    ? `template.${subject.templateId}`
    : `${subject.kind}.${subject.key}`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One `role_access_grants` row, as the resolution and the service read it. */
export interface GrantRow {
  readonly subject_kind: string;
  readonly subject_key: string | null;
  readonly template_id: string | null;
  readonly level: string;
}

/** The subject a stored row names, or `null` for a row outside the vocabulary (never trusted as a grant). */
export function subjectOfRow(row: GrantRow): GrantSubject | null {
  switch (row.subject_kind) {
    case "roster_category":
      return (ROSTER_CATEGORIES as readonly string[]).includes(row.subject_key ?? "")
        ? { kind: "roster", key: row.subject_key as RosterCategory }
        : null;
    case "recruiting_category":
      return (RECRUITING_CATEGORIES as readonly string[]).includes(row.subject_key ?? "")
        ? { kind: "recruiting", key: row.subject_key as RecruitingCategory }
        : null;
    case "event_template":
      return row.template_id ? { kind: "template", templateId: row.template_id } : null;
    case "switch":
      return (ACCESS_SWITCHES as readonly string[]).includes(row.subject_key ?? "")
        ? { kind: "switch", key: row.subject_key as AccessSwitch }
        : null;
    default:
      return null;
  }
}

/** The stored columns for a subject — the inverse of {@link subjectOfRow}. */
export function rowOfSubject(subject: GrantSubject): {
  subjectKind: GrantSubjectKind;
  subjectKey: string | null;
  templateId: string | null;
} {
  switch (subject.kind) {
    case "roster":
      return { subjectKind: "roster_category", subjectKey: subject.key, templateId: null };
    case "recruiting":
      return { subjectKind: "recruiting_category", subjectKey: subject.key, templateId: null };
    case "template":
      return { subjectKind: "event_template", subjectKey: null, templateId: subject.templateId };
    case "switch":
      return { subjectKind: "switch", subjectKey: subject.key, templateId: null };
  }
}

/**
 * The union-maximum of any number of rows, from any number of seats. A row
 * outside the vocabulary, or at a level its line does not admit, grants
 * nothing: absence of a decision is never permission.
 */
export function mergeGrantRows(rows: readonly GrantRow[]): OperatorGrants {
  const roster: Record<string, CategoryLevel> = { ...NO_GRANTS.roster };
  const recruiting: Record<string, CategoryLevel> = { ...NO_GRANTS.recruiting };
  const templates: Record<string, TemplateLevel> = {};
  const switches: Record<string, SwitchLevel> = { ...NO_GRANTS.switches };

  for (const row of rows) {
    const subject = subjectOfRow(row);
    if (subject === null || !isLevelFor(subject, row.level)) continue;

    const current = grantLevel(
      { roster, recruiting, templates, switches } as OperatorGrants,
      subject,
    );
    if (levelRank(subject, row.level) < levelRank(subject, current)) continue;

    switch (subject.kind) {
      case "roster":
        roster[subject.key] = row.level as CategoryLevel;
        break;
      case "recruiting":
        recruiting[subject.key] = row.level as CategoryLevel;
        break;
      case "template":
        templates[subject.templateId] = row.level as TemplateLevel;
        break;
      case "switch":
        switches[subject.key] = row.level as SwitchLevel;
        break;
    }
  }

  return Object.freeze({
    roster: Object.freeze(roster) as OperatorGrants["roster"],
    recruiting: Object.freeze(recruiting) as OperatorGrants["recruiting"],
    templates: Object.freeze(templates),
    switches: Object.freeze(switches) as OperatorGrants["switches"],
  });
}

/** One line whose value would change, from → to. What Copy access and Grant everything list before confirming. */
export interface GrantChange {
  readonly subject: GrantSubject;
  readonly from: GrantLevel;
  readonly to: GrantLevel;
}

/**
 * Every line on which `target` differs from `current`, over the roster,
 * recruiting and switch lines and the union of both snapshots' templates.
 * Order: roster, recruiting, templates (in `templateOrder` when given), switches.
 */
export function diffGrants(
  current: OperatorGrants,
  target: OperatorGrants,
  templateOrder: readonly string[] = [],
): GrantChange[] {
  const templateIds = [
    ...new Set([
      ...templateOrder,
      ...Object.keys(current.templates),
      ...Object.keys(target.templates),
    ]),
  ];
  const subjects: GrantSubject[] = [
    ...subjectsOf(current, "roster"),
    ...subjectsOf(current, "recruiting"),
    ...templateIds.map((templateId): GrantSubject => ({ kind: "template", templateId })),
    ...subjectsOf(current, "switch"),
  ];

  const changes: GrantChange[] = [];
  for (const subject of subjects) {
    const from = grantLevel(current, subject);
    const to = grantLevel(target, subject);
    if (from !== to) changes.push({ subject, from, to });
  }
  return changes;
}

/**
 * The seven templates `20260916090000_event_templates.sql` seeds, by their fixed
 * ids: Practice, Strength and conditioning, Chalk, Game, Social, Recruitment,
 * Meeting. For fixtures that need the seeded matrix without a database.
 */
export const SEEDED_TEMPLATE_IDS: readonly string[] = Object.freeze([
  "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  "8fb4acfc-1d41-53b0-bda8-202f454a8629",
  "b547e0b3-f48c-5601-9dc6-e8725fc434f9",
  "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae",
  "8de00424-52a8-52ad-9c9f-a29823f9c4bf",
  "ae03257b-292e-5a97-b6ef-c3a6a2b839d7",
  "660cdcb7-51e3-5a19-aaa2-08c5256af288",
]);
