/**
 * The whole synthetic universe this mockup runs on — LAN-200.
 *
 * It stands in for the service layer. There is no Supabase client, no service
 * call and no seed anywhere under `recruitment-preview/`, which is what lets
 * the route live outside `/operate` and open without a login or a database
 * lease.
 *
 * **Nobody here is real.** Rosalind Penhaligon (`identified`) and Tobias
 * Wrenfield (`engaged`) are the two prospects `scripts/seed-local.mjs` already
 * invents, carried across so the board reads the way the approved `W1-01`
 * frame reads; the other four are invented in the same register. LAN-86 keeps
 * real club data out of every environment, and a mockup is an environment.
 *
 * Shapes follow the real rows on purpose — `people` and
 * `recruitment_prospects` as `20260810120400_domain_membership.sql` declares
 * them — so that reading this file tells you what a real implementation would
 * be reading. Where a field is this mission's proposal rather than a shipped
 * column, its comment says so.
 */

/**
 * The seven-value ladder, in ladder order. `packet.json`'s locked operating
 * model: "One status, seven values … Not tiered, not split into on-board and
 * off-board sets. Whether a recruit appears on the board is a display rule
 * read off this one field."
 */
export const PROSPECT_STATUSES = Object.freeze([
  "identified",
  "engaged",
  "committed",
  "joined",
  "declined",
  "disengaged",
  "void",
] as const);

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/** Where a status sits in ladder order — the board's default sort. */
export const LADDER_ORDER: Readonly<Record<ProspectStatus, number>> = Object.freeze(
  Object.fromEntries(PROSPECT_STATUSES.map((status, index) => [status, index])) as Record<
    ProspectStatus,
    number
  >,
);

/**
 * The four statuses that take somebody off the board — `W13`'s three exits
 * plus `W14`'s flip. Leaving the board is a display rule read off the one
 * status field, never an archive and never a delete.
 */
export const OFF_BOARD_STATUSES: ReadonlySet<ProspectStatus> = new Set<ProspectStatus>([
  "joined",
  "declined",
  "disengaged",
  "void",
]);

/**
 * Each rung's colour on the chip.
 *
 * Hand-mixed rather than taken from MUI's semantic palette, because the
 * semantic set has three "good" colours and seven rungs, and `slice-ux.md` § 7
 * forbids colour carrying a state on its own — every chip here also says its
 * word. Teal is the Recruitment band's own `#00695c`, so a rung and its band
 * read as one thing.
 */
export const STATUS_COLOUR: Readonly<Record<ProspectStatus, string>> = Object.freeze({
  identified: "#90a4ae",
  engaged: "#00695c",
  committed: "#2e7d32",
  joined: "#0b3d91",
  declined: "#8d6e63",
  disengaged: "#b26a00",
  void: "#616161",
});

/**
 * What each rung means, in one line, shown in the status dropdown and on the
 * exit confirmation. `W13`'s own table for the three exits; the rest from the
 * packet's ladder.
 */
export const STATUS_MEANING: Readonly<Record<ProspectStatus, string>> = Object.freeze({
  identified: "The club knows they exist.",
  engaged: "They have interacted — an event, an answer, a reply.",
  committed: "They have said they are in.",
  joined: "A season membership exists. They are on the roster.",
  declined: "Hard no. They said no.",
  disengaged: "Soft no. They stopped engaging. Recoverable.",
  void: "The record was a mistake and should never have existed.",
});

// ---------------------------------------------------------------------------
// Consent — season-scoped, and this mission's own proposal
// ---------------------------------------------------------------------------

/**
 * The five consent states, end to end — the ticket's item 11, for which no
 * approved screen exists.
 *
 * Consent is **season-scoped**, keyed to the person and the season, per the
 * consent model settled with Brian on 2026-08-31: "Granted for a season it
 * carries from recruit through onboarding to player; each new season is
 * re-approved."
 *
 * `refused` and `withdrawn` are deliberately two states rather than one. They
 * gate the same thing today, but they are different facts about a person —
 * one never said yes, the other said yes and changed their mind — and only the
 * second has a date the club has to be able to answer for.
 */
export const CONSENT_STATES = Object.freeze([
  "never_asked",
  "asked",
  "granted",
  "refused",
  "withdrawn",
] as const);

export type ConsentState = (typeof CONSENT_STATES)[number];

export const CONSENT_LABELS: Readonly<Record<ConsentState, string>> = Object.freeze({
  never_asked: "Never asked",
  asked: "Asked, no answer",
  granted: "Granted",
  refused: "Refused",
  withdrawn: "Withdrawn",
});

/** Whether the club may send this person a template at all. */
export const CONSENT_PERMITS_SENDING: Readonly<Record<ConsentState, boolean>> = Object.freeze({
  never_asked: false,
  asked: true,
  granted: true,
  refused: false,
  withdrawn: false,
});

/**
 * What the club may send in each state, said in the club's own terms rather
 * than as a boolean.
 *
 * `asked` permits sending because the ask itself is a send: the sign-up form
 * reaches somebody by exactly one WhatsApp template carrying its link, and
 * that template is what the walk-up and operator-add doors fire. Nothing
 * beyond that one template goes out until the form comes back ticked.
 */
export const CONSENT_EFFECT: Readonly<Record<ConsentState, string>> = Object.freeze({
  never_asked: "Nothing may be sent. No door has reached them yet.",
  asked:
    "Only the one template carrying the sign-up form. Nothing else, and no reminder beyond one.",
  granted: "Every recruitment template, for this season only.",
  refused: "Nothing may be sent. They did not tick the box.",
  withdrawn: "Nothing may be sent. They ticked it, then used the opt-out link.",
});

// ---------------------------------------------------------------------------
// The season, the events, and the people
// ---------------------------------------------------------------------------

export const SEASON_LABEL = "2026-27";

/** The QR points here. Not a real domain — `.example` is reserved by RFC 2606. */
export const SIGN_UP_URL = "oxfordlancers.example/join";

/** The community group the saved sign-up page reveals. Also not real. */
export const GROUP_LINK = "chat.whatsapp.example/lancers-2026";

export interface RecruitmentEvent {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly shortDate: string;
  /** `occurred` and `upcoming` are the only two this mockup needs. */
  readonly status: "Occurred" | "Upcoming";
  readonly venue: string;
  readonly startsAt: string;
}

/**
 * Three recruitment events, oldest first — `W1`'s Events band appends one band
 * per event "in date order, oldest first, so the term reads left to right".
 */
export const EVENTS: readonly RecruitmentEvent[] = Object.freeze([
  Object.freeze({
    id: "freshers-fair",
    name: "Freshers' Fair",
    date: "30 Apr 2026",
    shortDate: "30 Apr",
    status: "Occurred" as const,
    venue: "Examination Schools",
    startsAt: "Thursday, 30 April at 11:00",
  }),
  Object.freeze({
    id: "taster-1",
    name: "Taster 1",
    date: "3 May 2026",
    shortDate: "3 May",
    status: "Occurred" as const,
    venue: "Iffley Road Astro",
    startsAt: "Sunday, 3 May at 14:00",
  }),
  Object.freeze({
    id: "taster-2",
    name: "Taster 2",
    date: "10 May 2026",
    shortDate: "10 May",
    status: "Upcoming" as const,
    venue: "Iffley Road Astro",
    startsAt: "Sunday, 10 May at 14:00",
  }),
]);

export type Rsvp = "yes" | "no" | null;
export type Attendance = "present" | "late" | "excused" | "absent" | null;

/** The words, taken from the two shipped maps rather than invented again. */
export const RSVP_LABEL: Readonly<Record<"yes" | "no", string>> = Object.freeze({
  yes: "Yes",
  no: "No",
});

export const ATTENDANCE_LABEL: Readonly<Record<NonNullable<Attendance>, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

/** `PRESENCE_COLORS` from the shipped attendance sheet, copied rather than re-chosen. */
export const ATTENDANCE_COLOUR: Readonly<
  Record<NonNullable<Attendance>, "success" | "warning" | "info" | "error">
> = Object.freeze({
  present: "success",
  late: "warning",
  excused: "info",
  absent: "error",
});

export interface EventParticipation {
  readonly eventId: string;
  readonly rsvp: Rsvp;
  readonly attendance: Attendance;
}

export interface RecruitNote {
  readonly body: string;
  readonly author: string;
  readonly at: string;
}

export interface AuditEntry {
  readonly summary: string;
  readonly detail: string;
}

/**
 * Questionnaire A — who you are. Folded into the sign-up form by the consent
 * model.
 *
 * `knownAs` rather than a preferred name: `main` has `person_aliases`, an
 * `Aliases` row on the record, "Search name or alias" on both boards and
 * "Known as" on the returner intake — and no preferred-name field anywhere.
 * The answer writes an alias.
 */
export interface QuestionnaireAAnswers {
  readonly knownAs: string | null;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly college: string | null;
  readonly matriculationYear: string | null;
  readonly expectedGraduationYear: string | null;
  readonly degreeField: string | null;
}

/** Questionnaire B — how you came to football. `W4`'s six, as Brian amended them. */
export interface QuestionnaireBAnswers {
  readonly playedBefore: string | null;
  readonly watchedBefore: string | null;
  readonly positionInterest: string | null;
  readonly gearOwned: string | null;
  readonly heardVia: string | null;
  readonly anythingElse: string | null;
}

export interface Recruit {
  /** Stands in for `recruitment_prospects.id`. */
  readonly id: string;
  /** Stands in for `people.id`. */
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  // --- Person facts, read-only on every recruitment surface -----------------
  readonly college: string | null;
  readonly matriculationYear: number | null;
  readonly expectedGraduationYear: number | null;
  readonly degreeField: string | null;
  readonly mobile: string | null;
  readonly email: string | null;
  // --- `recruitment_prospects` ---------------------------------------------
  readonly status: ProspectStatus;
  readonly source: string;
  readonly firstContactOn: string;
  readonly committedOn: string | null;
  /** Set when the exit was a judgement rather than something the recruit said. */
  readonly exitReason: string | null;
  readonly notes: readonly RecruitNote[];
  // --- This mission's proposals --------------------------------------------
  readonly consent: ConsentState;
  readonly consentOn: string | null;
  readonly questionnaireASentOn: readonly string[];
  readonly questionnaireAAnswers: QuestionnaireAAnswers | null;
  readonly questionnaireBSentOn: readonly string[];
  readonly questionnaireBAnswers: QuestionnaireBAnswers | null;
  readonly events: readonly EventParticipation[];
  readonly audit: readonly AuditEntry[];
}

const EMPTY_A: QuestionnaireAAnswers = Object.freeze({
  knownAs: null,
  mobile: null,
  email: null,
  college: null,
  matriculationYear: null,
  expectedGraduationYear: null,
  degreeField: null,
});

/**
 * Six recruits, deterministic, matching the approved `W1-01` and `W1-02`
 * frames line for line — the same six names, the same rungs, the same sources,
 * the same person facts, and the same event grid, including its two
 * deliberate mismatches: Clementine Varrow said Yes and was Absent; Ambrose
 * Kittiwake said No and was Present.
 *
 * The five consent states are spread across them so the ticket's item 11 has
 * somebody in each, and so the record's "may we message this person?" banner
 * has both of its causes on the board at once — Ambrose declined the club,
 * Clementine withdrew her consent while staying interested. That is exactly
 * the distinction `W2` records as open and unanswered.
 */
export const RECRUITS: readonly Recruit[] = Object.freeze([
  Object.freeze({
    id: "p-rosalind",
    personId: "person-rosalind",
    givenName: "Rosalind",
    familyName: "Penhaligon",
    displayName: "Rosalind Penhaligon",
    // She answered "Roz" on the sign-up form. That writes an alias, which is
    // the field `main` actually has, and the board's search box finds her by it.
    aliases: Object.freeze(["Roz"]),
    college: "Dunsfold",
    matriculationYear: 2026,
    expectedGraduationYear: 2029,
    degreeField: "Human Sciences",
    mobile: "07700 900318",
    email: null,
    status: "identified" as ProspectStatus,
    source: "QR · Freshers' Fair",
    firstContactOn: "28 April 2026",
    committedOn: null,
    exitReason: null,
    notes: Object.freeze([
      Object.freeze({
        body: "Came to the stand with a friend from Dunsfold.",
        author: "Caspian Hallowfield",
        at: "28 April 2026",
      }),
    ]),
    consent: "granted" as ConsentState,
    consentOn: "28 April 2026",
    // The QR put the personal questionnaire in front of her at the stand. No
    // template was sent — she scanned it — but she went through the form and
    // gave consent on it, which is the only place consent is ever given.
    questionnaireASentOn: Object.freeze(["28 April 2026"]),
    questionnaireAAnswers: Object.freeze({
      knownAs: "Roz",
      mobile: "07700 900318",
      email: null,
      college: "Dunsfold",
      matriculationYear: "2026",
      expectedGraduationYear: "2029",
      degreeField: "Human Sciences",
    }),
    questionnaireBSentOn: Object.freeze([]),
    questionnaireBAnswers: null,
    events: Object.freeze([
      Object.freeze({ eventId: "freshers-fair", rsvp: null, attendance: "absent" as Attendance }),
      Object.freeze({ eventId: "taster-1", rsvp: null, attendance: null }),
      Object.freeze({ eventId: "taster-2", rsvp: null, attendance: null }),
    ]),
    audit: Object.freeze([
      Object.freeze({
        summary: "Signed up and gave consent · sign-up form",
        detail: "28 Apr 2026, 14:14",
      }),
      Object.freeze({
        summary: "Added as identified · QR scan at the Freshers' Fair stand",
        detail: "28 Apr 2026, 14:12",
      }),
    ]),
  }),
  Object.freeze({
    id: "p-tobias",
    personId: "person-tobias",
    givenName: "Tobias",
    familyName: "Wrenfield",
    displayName: "Tobias Wrenfield",
    aliases: Object.freeze(["Toby"]),
    college: "Marlbrook",
    matriculationYear: 2025,
    expectedGraduationYear: 2028,
    degreeField: "Engineering Science",
    mobile: "07700 900412",
    email: "t.wrenfield@example.ac.uk",
    status: "engaged" as ProspectStatus,
    source: "Walk-up · Taster 1",
    firstContactOn: "3 May 2026",
    committedOn: null,
    exitReason: null,
    notes: Object.freeze([
      Object.freeze({
        body: "Came back for a second taster; waiting to hear about subs before committing.",
        author: "Caspian Hallowfield",
        at: "5 May 2026",
      }),
    ]),
    consent: "granted" as ConsentState,
    consentOn: "3 May 2026",
    questionnaireASentOn: Object.freeze(["3 May 2026"]),
    questionnaireAAnswers: Object.freeze({
      knownAs: "Toby",
      mobile: "07700 900412",
      email: "t.wrenfield@example.ac.uk",
      college: "Marlbrook",
      matriculationYear: "2025",
      expectedGraduationYear: "2028",
      degreeField: "Engineering Science",
    }),
    questionnaireBSentOn: Object.freeze(["6 May 2026", "9 May 2026"]),
    questionnaireBAnswers: Object.freeze({
      playedBefore: "No",
      watchedBefore: "Yes",
      positionInterest: "WR · Wide Receiver, TE · Tight End",
      gearOwned: "Boots, Mouthguard",
      heardVia: "A friend or teammate",
      anythingElse: "Played a lot of basketball at school. Free most Sundays after week 4.",
    }),
    events: Object.freeze([
      Object.freeze({
        eventId: "freshers-fair",
        rsvp: "yes" as Rsvp,
        attendance: "present" as Attendance,
      }),
      Object.freeze({ eventId: "taster-1", rsvp: null, attendance: "present" as Attendance }),
      Object.freeze({ eventId: "taster-2", rsvp: "yes" as Rsvp, attendance: null }),
    ]),
    audit: Object.freeze([
      Object.freeze({
        summary: "Recruitment questionnaire answered",
        detail: "9 May 2026, 21:02 · answered by Tobias",
      }),
      Object.freeze({
        summary: "Recruitment questionnaire reminder sent · WhatsApp template",
        detail: "9 May 2026, 09:00 · delivered",
      }),
      Object.freeze({
        summary: "Recruitment questionnaire sent · WhatsApp template",
        detail: "6 May 2026, 09:00 · delivered",
      }),
      Object.freeze({
        summary: "identified → engaged · attended Taster 1",
        detail: "3 May 2026, 15:40",
      }),
      Object.freeze({
        summary: "Signed up and gave consent · sign-up form",
        detail: "3 May 2026, 14:31",
      }),
      Object.freeze({
        summary: "Added as identified · walk-up at Taster 1",
        detail: "3 May 2026, 14:22 · Caspian Hallowfield",
      }),
    ]),
  }),
  Object.freeze({
    id: "p-marguerite",
    personId: "person-marguerite",
    givenName: "Marguerite",
    familyName: "Ashdown",
    displayName: "Marguerite Ashdown",
    aliases: Object.freeze([]),
    college: "Kestrelhall",
    matriculationYear: 2026,
    expectedGraduationYear: 2029,
    degreeField: "Law",
    mobile: "07700 900461",
    email: "m.ashdown@example.ac.uk",
    status: "committed" as ProspectStatus,
    source: "Operator · sourced",
    firstContactOn: "22 April 2026",
    committedOn: null,
    exitReason: null,
    notes: Object.freeze([
      Object.freeze({
        body: "Recommended by the women's lacrosse captain. Wants to play, waiting on the term card.",
        author: "Caspian Hallowfield",
        at: "22 April 2026",
      }),
    ]),
    consent: "asked" as ConsentState,
    consentOn: null,
    questionnaireASentOn: Object.freeze(["22 April 2026"]),
    questionnaireAAnswers: null,
    questionnaireBSentOn: Object.freeze([]),
    questionnaireBAnswers: null,
    events: Object.freeze([
      Object.freeze({
        eventId: "freshers-fair",
        rsvp: "yes" as Rsvp,
        attendance: "present" as Attendance,
      }),
      Object.freeze({
        eventId: "taster-1",
        rsvp: "yes" as Rsvp,
        attendance: "late" as Attendance,
      }),
      Object.freeze({ eventId: "taster-2", rsvp: "yes" as Rsvp, attendance: null }),
    ]),
    audit: Object.freeze([
      Object.freeze({
        summary: "engaged → committed · said she is in after Taster 1",
        detail: "4 May 2026, 19:30 · Caspian Hallowfield",
      }),
      Object.freeze({
        summary: "Sign-up form sent · WhatsApp template",
        detail: "22 Apr 2026, 16:05 · delivered, not yet opened",
      }),
      Object.freeze({
        summary: "Added as identified · operator add, sourced",
        detail: "22 Apr 2026, 16:04 · Caspian Hallowfield",
      }),
    ]),
  }),
  Object.freeze({
    id: "p-peregrine",
    personId: "person-peregrine",
    givenName: "Peregrine",
    familyName: "Oakhollow",
    displayName: "Peregrine Oakhollow",
    aliases: Object.freeze([]),
    college: null,
    matriculationYear: null,
    expectedGraduationYear: null,
    degreeField: null,
    mobile: "07700 900577",
    email: null,
    status: "identified" as ProspectStatus,
    source: "QR · Taster 2",
    firstContactOn: "10 May 2026",
    committedOn: null,
    exitReason: null,
    notes: Object.freeze([]),
    consent: "never_asked" as ConsentState,
    consentOn: null,
    questionnaireASentOn: Object.freeze([]),
    questionnaireAAnswers: null,
    questionnaireBSentOn: Object.freeze([]),
    questionnaireBAnswers: null,
    events: Object.freeze([
      Object.freeze({ eventId: "freshers-fair", rsvp: null, attendance: null }),
      Object.freeze({ eventId: "taster-1", rsvp: null, attendance: null }),
      Object.freeze({ eventId: "taster-2", rsvp: null, attendance: null }),
    ]),
    audit: Object.freeze([
      Object.freeze({
        summary: "Added as identified · QR scan, no form submitted",
        detail: "10 May 2026, 14:03",
      }),
    ]),
  }),
  Object.freeze({
    id: "p-clementine",
    personId: "person-clementine",
    givenName: "Clementine",
    familyName: "Varrow",
    displayName: "Clementine Varrow",
    aliases: Object.freeze([]),
    college: "Harewell",
    matriculationYear: 2026,
    expectedGraduationYear: 2029,
    degreeField: "History",
    mobile: null,
    email: "c.varrow@example.ac.uk",
    status: "disengaged" as ProspectStatus,
    source: "Walk-up · Freshers' Fair",
    firstContactOn: "30 April 2026",
    committedOn: null,
    exitReason: "Said yes to Taster 1 and did not come; nothing since.",
    notes: Object.freeze([
      Object.freeze({
        body: "Keen at the stand. Asked to be left alone on WhatsApp — email is fine.",
        author: "Caspian Hallowfield",
        at: "12 May 2026",
      }),
    ]),
    consent: "withdrawn" as ConsentState,
    consentOn: "12 May 2026",
    questionnaireASentOn: Object.freeze(["30 April 2026"]),
    questionnaireAAnswers: Object.freeze({
      knownAs: null,
      mobile: null,
      email: "c.varrow@example.ac.uk",
      college: "Harewell",
      matriculationYear: "2026",
      expectedGraduationYear: "2029",
      degreeField: "History",
    }),
    questionnaireBSentOn: Object.freeze([]),
    questionnaireBAnswers: null,
    events: Object.freeze([
      Object.freeze({
        eventId: "freshers-fair",
        rsvp: "yes" as Rsvp,
        attendance: "absent" as Attendance,
      }),
      Object.freeze({ eventId: "taster-1", rsvp: "no" as Rsvp, attendance: null }),
      Object.freeze({ eventId: "taster-2", rsvp: null, attendance: null }),
    ]),
    audit: Object.freeze([
      Object.freeze({
        summary: "Consent withdrawn · opt-out link",
        detail: "12 May 2026, 08:12 · withdrawn by Clementine",
      }),
      Object.freeze({
        summary: "engaged → disengaged · did not come to Taster 1, nothing since",
        detail: "11 May 2026, 17:44 · Caspian Hallowfield",
      }),
      Object.freeze({
        summary: "Signed up and gave consent · sign-up form",
        detail: "30 Apr 2026, 12:20",
      }),
      Object.freeze({
        summary: "Added as identified · walk-up at the Freshers' Fair",
        detail: "30 Apr 2026, 12:18 · Caspian Hallowfield",
      }),
    ]),
  }),
  Object.freeze({
    id: "p-ambrose",
    personId: "person-ambrose",
    givenName: "Ambrose",
    familyName: "Kittiwake",
    displayName: "Ambrose Kittiwake",
    aliases: Object.freeze([]),
    college: null,
    matriculationYear: null,
    expectedGraduationYear: null,
    degreeField: null,
    mobile: "07700 900884",
    email: null,
    status: "declined" as ProspectStatus,
    source: "Walk-up · Taster 1",
    firstContactOn: "3 May 2026",
    committedOn: null,
    exitReason: "Said rugby clashes.",
    notes: Object.freeze([
      Object.freeze({
        body: "Said rugby clashes. Happy to be asked again next year.",
        author: "Caspian Hallowfield",
        at: "2 May 2026",
      }),
    ]),
    consent: "refused" as ConsentState,
    consentOn: null,
    questionnaireASentOn: Object.freeze(["3 May 2026"]),
    questionnaireAAnswers: null,
    questionnaireBSentOn: Object.freeze([]),
    questionnaireBAnswers: null,
    events: Object.freeze([
      Object.freeze({
        eventId: "freshers-fair",
        rsvp: "no" as Rsvp,
        attendance: "absent" as Attendance,
      }),
      Object.freeze({ eventId: "taster-1", rsvp: null, attendance: "present" as Attendance }),
      Object.freeze({ eventId: "taster-2", rsvp: null, attendance: null }),
    ]),
    audit: Object.freeze([
      Object.freeze({
        summary: "identified → declined · said rugby clashes",
        detail: "2 May 2026, 20:11 · Caspian Hallowfield",
      }),
      Object.freeze({
        summary: "Sign-up form opened, consent not given",
        detail: "3 May 2026, 18:09 · answered by Ambrose",
      }),
      Object.freeze({
        summary: "Sign-up form sent · WhatsApp template",
        detail: "3 May 2026, 18:07 · delivered",
      }),
      Object.freeze({
        summary: "Added as identified · walk-up at Taster 1",
        detail: "3 May 2026, 18:05 · Caspian Hallowfield",
      }),
    ]),
  }),
]);

export { EMPTY_A };

// ---------------------------------------------------------------------------
// The players who share a recruitment event's sheet with the recruits — `W12`
// ---------------------------------------------------------------------------

export interface SheetPlayer {
  readonly key: string;
  readonly displayName: string;
  /** Coaches and other people on the team sit with the players who said no. */
  readonly role: "player" | "coach";
  readonly rsvp: Rsvp;
  readonly attendance: Attendance;
}

/**
 * A short bench of players for the recruitment event's own attendance sheet.
 *
 * Deliberately short. `W12`'s point is the **ordering** — recruits as their
 * own group at the top, everyone else below — and thirty-seven rows would
 * make that harder to see rather than easier, on a surface whose 375px frame
 * is the real one.
 */
export const SHEET_PLAYERS: readonly SheetPlayer[] = Object.freeze([
  Object.freeze({
    key: "pl-alaric",
    displayName: "Alaric Brindlewood",
    role: "player" as const,
    rsvp: "yes" as Rsvp,
    attendance: "present" as Attendance,
  }),
  Object.freeze({
    key: "pl-corwin",
    displayName: "Corwin Vellacott",
    role: "player" as const,
    rsvp: "yes" as Rsvp,
    attendance: null,
  }),
  Object.freeze({
    key: "pl-osgood",
    displayName: "Osgood Lanthorne",
    role: "player" as const,
    rsvp: "yes" as Rsvp,
    attendance: "late" as Attendance,
  }),
  Object.freeze({
    key: "pl-emrys",
    displayName: "Emrys Netherby",
    role: "player" as const,
    rsvp: "no" as Rsvp,
    attendance: null,
  }),
  Object.freeze({
    key: "pl-kestrel",
    displayName: "Kestrel Hawksmoor",
    role: "player" as const,
    rsvp: null,
    attendance: null,
  }),
  // Coaches and anyone else on the team, so "everyone else" is somebody on the
  // screen rather than a description of who would be there.
  Object.freeze({
    key: "co-hollis",
    displayName: "Hollis Winterbourne",
    role: "coach" as const,
    rsvp: null,
    attendance: null,
  }),
  Object.freeze({
    key: "co-fen",
    displayName: "Fen Ravensmere",
    role: "coach" as const,
    rsvp: null,
    attendance: null,
  }),
]);

// ---------------------------------------------------------------------------
// The QR code's own state — `W1-04` and `W10`
// ---------------------------------------------------------------------------

export interface QrCode {
  readonly id: string;
  readonly url: string;
  readonly mintedOn: string;
  readonly mintedBy: string;
  readonly signIns: number;
  readonly live: boolean;
  readonly deactivatedOn: string | null;
}

/**
 * The season's one code. "One code, minted once a season" — per-event codes
 * were considered and dropped, because the recruit's own `Came in through` is
 * already the answer to where they came from.
 */
export const INITIAL_QR: QrCode = Object.freeze({
  id: "qr-2026-27",
  url: SIGN_UP_URL,
  mintedOn: "12 April 2026",
  mintedBy: "Caspian Hallowfield",
  signIns: 59,
  live: true,
  deactivatedOn: null,
});

// ---------------------------------------------------------------------------
// Everything the club ever sends a recruit — `W11`, corrected by the consent
// model
// ---------------------------------------------------------------------------

export interface LadderStep {
  readonly template: string;
  readonly fires: string;
  readonly lands: string;
  readonly withdrawn?: string;
}

/**
 * `W11`'s own table, with one row struck.
 *
 * The consent model of 2026-08-31 withdrew `recruit_details_ask`: "the welcome
 * carries the form and is itself the ask". So the welcome's landing place
 * changes from the WhatsApp group to the sign-up form, and the separate
 * details ask that used to fire a day later has nothing left to do. It is kept
 * in the list, struck through, because a step that was removed by a decision
 * is more useful on the screen than absent from it.
 */
export const RECRUIT_LADDER: readonly LadderStep[] = Object.freeze([
  Object.freeze({
    template: "recruit_welcome",
    fires: "Capture — walk-up and operator-add only",
    lands: "The sign-up form, prefilled and tokenised",
  }),
  Object.freeze({
    template: "recruit_details_ask",
    fires: "1 day after capture",
    lands: "The personal-details form",
    withdrawn:
      "Withdrawn by the consent model, 2026-08-31. The welcome now carries the form and is itself the ask.",
  }),
  Object.freeze({
    template: "recruit_details_reminder",
    fires: "3 days later, once",
    lands: "The same form",
  }),
  Object.freeze({
    template: "recruit_interest_ask",
    fires: "3 days after capture",
    lands: "Questionnaire B",
  }),
  Object.freeze({
    template: "recruit_interest_reminder",
    fires: "3 days later, once",
    lands: "The same form",
  }),
  Object.freeze({
    template: "event_invitation",
    fires: "A recruitment event is approved",
    lands: "The yes page or the no page",
  }),
  Object.freeze({
    template: "The event follow-up",
    fires: "2 days later, once, only if no answer",
    lands: "The same two pages",
  }),
]);

// ---------------------------------------------------------------------------
// What Questionnaire B offers — the season's own vocabulary, and the kit list
// ---------------------------------------------------------------------------

/**
 * The club's real position list, copied from `scripts/seed-local.mjs`'s
 * `VOCAB_2026` — the OULAFC list of the term-card era. Twenty-two positions in
 * three sections, and **not** invented here: `position_vocabularies` is a table
 * and invariant S3 makes a position a foreign key to the season's own list, so
 * a real implementation reads these per season rather than hard-coding them.
 *
 * Brian, 2026-09-01: "all the positions we have available in the roster right
 * now, grouped by sections in the drop-down itself."
 */
export const POSITION_GROUPS: readonly {
  readonly label: string;
  readonly positions: readonly { readonly code: string; readonly label: string }[];
}[] = Object.freeze([
  Object.freeze({
    label: "Offence",
    positions: Object.freeze([
      { code: "QB", label: "Quarterback" },
      { code: "RB", label: "Running Back" },
      { code: "FB", label: "Full Back" },
      { code: "WB", label: "Wing Back" },
      { code: "WR", label: "Wide Receiver" },
      { code: "TE", label: "Tight End" },
      { code: "T", label: "Tackle" },
      { code: "G", label: "Guard" },
      { code: "C", label: "Centre" },
    ]),
  }),
  Object.freeze({
    label: "Defence",
    positions: Object.freeze([
      { code: "DE", label: "Defensive End" },
      { code: "DT", label: "Defensive Tackle" },
      { code: "NT", label: "Nose Tackle" },
      { code: "MLB", label: "Mike Linebacker" },
      { code: "WLB", label: "Will Linebacker" },
      { code: "SLB", label: "Sam Linebacker" },
      { code: "CB", label: "Cornerback" },
      { code: "FS", label: "Free Safety" },
      { code: "SS", label: "Strong Safety" },
    ]),
  }),
  Object.freeze({
    label: "Special teams",
    positions: Object.freeze([
      { code: "KO", label: "Kickoff" },
      { code: "KR", label: "Kick Return" },
      { code: "PUNT", label: "Punt" },
      { code: "FG", label: "Field Goal" },
    ]),
  }),
]);

/**
 * Kit, one item at a time — Brian, 2026-09-01: "Gear should also be a
 * multi-select section where it doesn't have combinations." The old list
 * offered "Boots only" and "Boots and gloves", which made somebody with boots
 * and a helmet pick the nearest wrong answer.
 */
export const GEAR_ITEMS: readonly string[] = Object.freeze([
  "Boots",
  "Gloves",
  "Mouthguard",
  "Helmet",
  "Shoulder pads",
  "Padded trousers",
]);

/** The one template Meta has approved today. The other four are an owner gate. */
export const TEMPLATES_APPROVED_IN_META: ReadonlySet<string> = new Set(["event_invitation"]);
