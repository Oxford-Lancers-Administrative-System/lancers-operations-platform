import { OPERATOR_ACCOUNT_STATE_DEFINITIONS } from "@/lib/services/operator-account-state";

/**
 * The words of the How administration works guide — LAN-134, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-club-operating-guide` and
 * `DEC-in-app-administration-guide`.
 *
 * ## Why the copy is data rather than markup
 *
 * The requirement's last sentence is the whole reason this mission exists: the
 * guide "contains no callouts, SQL, Supabase-dashboard, administrator-created-
 * password or WhatsApp-authentication procedure". A guide that told a club
 * officer to open a database console would document precisely the thing this
 * work abolishes, and it would do so in the one place an officer is most likely
 * to believe.
 *
 * That is a property of the *text*, and text buried in JSX can only be checked
 * by reading it. Here every sentence is reachable from one exported structure,
 * `guideText()` flattens it, and `content.test.ts` asserts the prohibition over
 * the flattened whole. A future edit that reintroduces a forbidden procedure
 * fails a test rather than surviving review.
 *
 * The same structure is what lets the vocabulary be checked.
 * `DEC-administration-language-and-states` bans three technical labels from the
 * interface — *Durable Person*, *Effective Access* and a generic *Access
 * History* — and names the two audit projections exactly. Those are assertions
 * over strings, and strings are what this file holds.
 *
 * ## Where the state names come from
 *
 * The five state labels are **imported**, never retyped.
 * `operator-account-state.ts` owns them for the reason its own note gives: two
 * surfaces showing the same state must not be able to describe it differently.
 * A guide that called an account "Pending invitation" while the badge beside it
 * said "Invitation pending" would be worse than a guide with no state names in
 * it at all, because the reader would reasonably conclude they were two things.
 *
 * The action labels below are a local constant, and that is a deliberate
 * second-best. They are the words on the buttons `WP-surfaces` builds
 * (`operator-actions.tsx` and `role-actions.tsx`), which this package cannot
 * import because the two branch from `main` independently. They are pinned by
 * test against `DEC-administration-language-and-states`, and the moment both
 * packages are on `main` these should become one exported constant that the
 * buttons and this guide both read. That is recorded in the pull request as a
 * follow-up rather than left for somebody to notice.
 *
 * ## What is deliberately not here
 *
 * No troubleshooting of the application, no account recovery for the reader
 * themselves beyond naming the sign-in page's own link, and no description of
 * any procedure performed outside the application. Where the club's answer is
 * genuinely "this is not done here" the guide says so plainly and stops —
 * see the escalation entry, which names no tool, no console and no person.
 *
 * ## And nothing here describes a screen that does not exist
 *
 * The operating-year entry used to say "An earlier year can be opened and read,
 * but not changed" — LAN-141 finding 6. `readRoleHolders()` takes a `cycleId`,
 * returns `readOnly`, and is tested end to end; no production code calls it,
 * and the page-facing `readRoleCatalogue()` takes no year. So there was no way
 * to open an earlier year, and the guide sent a reader hunting for a control
 * that had never shipped — which is the same defect as the action labels below
 * being paraphrases, in the one place a club officer is most likely to believe
 * what they read.
 *
 * The entry now describes the application as it is, and points at the surface
 * that genuinely answers the question: each seat's **Holder history**, which
 * covers this year and past years. Building the switcher is a separate piece of
 * work against `REQ-explicit-cycle-assignment`, not a wording change, and it is
 * recorded as such rather than implied by a sentence.
 */

/** A run of answer text. `strong` is used only for a label the reader clicks or sees. */
export type GuideRun = string | { readonly strong: string };

export interface GuideParagraph {
  readonly kind: "paragraph";
  readonly runs: readonly GuideRun[];
}

export interface GuideList {
  /** `steps` renders in order and is numbered; `points` is unordered. */
  readonly kind: "steps" | "points";
  readonly items: readonly (readonly GuideRun[])[];
}

export type GuideBlock = GuideParagraph | GuideList;

export interface GuideEntry {
  /** Stable, and used for the accordion's element ids. */
  readonly id: string;
  readonly question: string;
  readonly answer: readonly GuideBlock[];
}

/** The page's own title and one line of context, matching the prototype. */
export const GUIDE_TITLE = "How administration works";
export const GUIDE_SUBTITLE = "Answers for routine operator and role administration";

/**
 * The names of the two audit projections, exactly as
 * `DEC-administration-language-and-states` fixes them.
 */
export const OPERATOR_AUDIT_HISTORY = "Operator audit history";
export const HOLDER_HISTORY = "Holder history";

/**
 * Every action label the guide tells a reader to look for.
 *
 * These are the button labels, not paraphrases: a guide that says "choose
 * Remove access" when the button says "Deactivate operator access" sends the
 * reader hunting for a control that is not there.
 */
export const ADMINISTRATION_ACTION_LABELS = Object.freeze({
  invite: "Invite operator",
  assign: "Assign role",
  replace: "Replace role",
  end: "End role",
  deactivate: "Deactivate operator access",
  restore: "Restore operator access",
  resend: "Resend invitation",
  correct: "Correct email and resend",
  recover: "Recover email access",
} as const);

const action = ADMINISTRATION_ACTION_LABELS;
const stateLabel = (key: keyof typeof OPERATOR_ACCOUNT_STATE_DEFINITIONS) =>
  OPERATOR_ACCOUNT_STATE_DEFINITIONS[key].label;

/** A strong run. Short, because the content below is mostly these. */
const s = (strong: string): GuideRun => ({ strong });

const paragraph = (...runs: GuideRun[]): GuideBlock => ({ kind: "paragraph", runs });
const steps = (...items: (readonly GuideRun[])[]): GuideBlock => ({ kind: "steps", items });
const points = (...items: (readonly GuideRun[])[]): GuideBlock => ({ kind: "points", items });

/**
 * The guide, in the order it is read.
 *
 * The order is the requirement's: the five ordinary workflows first, because
 * they are what somebody opens the page to do, then the four explanations that
 * make the workflows make sense, then refusals and escalation last — where
 * somebody arrives having already been told no.
 */
export const ADMINISTRATION_GUIDE: readonly GuideEntry[] = Object.freeze([
  {
    id: "invite",
    question: "How do I invite someone?",
    answer: [
      steps(
        ["Open Operators and choose ", s(action.invite), ", at the top right."],
        [
          "Search for the person first, by name or email. If the club already knows them — " +
            "including a current or former player — choose that record rather than creating a " +
            "second one for them.",
        ],
        [
          "If they are new, enter their first name, last name and personal email address. A " +
            "phone number is optional.",
        ],
        ["Choose at least one role. The invitation cannot be sent without one."],
        [
          "Send it. They receive an email with a secure first-access link, and they choose " +
            "their own password from it.",
        ],
      ),
      paragraph(
        "You never set somebody else's password, and there is no public sign-up. Until they " +
          "follow the link and choose one, their access reads ",
        s(stateLabel("invitation_pending")),
        ".",
      ),
      paragraph(
        "The role starts today unless you change it. A date still to come is allowed, and so " +
          "is a date in the past — that one asks for a reason, which is kept with the record.",
      ),
    ],
  },
  {
    id: "resend-invitation",
    question: "How do I resend an invitation, or correct the address I sent it to?",
    answer: [
      points(
        [
          s(action.resend),
          " is offered while their access reads ",
          s(stateLabel("invitation_pending")),
          " or ",
          s(stateLabel("delivery_failed")),
          ". A link that has expired is ordinary rather than a problem — send a new one " +
            "whenever they are ready.",
        ],
        [
          "If the address itself was wrong, use ",
          s(action.correct),
          ". The address it went to before is kept in the record rather than quietly " +
            "overwritten, so a message that reached the wrong mailbox can be traced later.",
        ],
        [
          "Once somebody is ",
          s(stateLabel("active")),
          " there is no invitation left to send. Moving a working account to a different " +
            "address is email recovery, below.",
        ],
      ),
      paragraph(
        "One case catches people out. If they opened the invitation link but never chose a " +
          "password, a further invitation cannot be sent to that address. Nothing is lost and " +
          "nobody needs to intervene: ask them to use ",
        s("Forgot password?"),
        " on the sign-in page and choose a password there. That finishes setting up the " +
          "account exactly as the invitation would have. Correcting the invitation to a " +
          "different address also works.",
      ),
    ],
  },
  {
    id: "assign-replace-role",
    question: "How do I assign or replace a role?",
    answer: [
      points(
        ["To fill a seat nobody holds, open it under Roles and choose ", s(action.assign), "."],
        [
          "When one person takes over from another, use ",
          s(action.replace),
          ". It ends the outgoing holder's assignment and starts the successor's together, and " +
            "both stay in the seat's history — neither is overwritten.",
        ],
      ),
      paragraph(
        "The operating year is filled in for you, which is why no form asks for it. The start " +
          "date is today unless you change it; a date still to come is allowed, and a date in " +
          "the past asks for a reason.",
      ),
      paragraph(
        "A successor who has never signed in holds the seat but cannot use it yet. Their " +
          "access stays ",
        s(stateLabel("invitation_pending")),
        " until they choose a password.",
      ),
    ],
  },
  {
    id: "end-role",
    question: "How do I end a role?",
    answer: [
      paragraph(
        "Use ",
        s(action.end),
        ", with a reason. It takes effect today unless you choose a later date, in which case " +
          "it is scheduled and the holder keeps the seat until then.",
      ),
      points(
        [
          s(action.end),
          " is the only action that leaves a seat unfilled. Deactivating somebody's access " +
            "does not.",
        ],
        ["The assignment is not deleted. It keeps its dates and stays in the seat's history."],
        [
          "Once an ending is recorded it cannot be changed or cancelled — not even one dated " +
            "in the future that has not arrived yet. Moving it would rewrite what the record " +
            "says happened. If the seat needs somebody in it again, assign it.",
        ],
      ),
    ],
  },
  {
    id: "deactivate-restore-access",
    question: "How do I stop and restore somebody's access?",
    answer: [
      points(
        [
          s(action.deactivate),
          " stops them signing in straight away, and their access reads ",
          s(stateLabel("deactivated")),
          ". A reason is required.",
        ],
        [
          "It changes no role. The seats they hold are untouched, no vacancy appears, and the " +
            "seat still shows them as its holder with their access deactivated.",
        ],
        [s(action.restore), " lets them sign in again on the same account. No reason is needed."],
      ),
      paragraph(
        "Restoring gives back only what is still in force. A seat that ended while they were " +
          "deactivated does not come back with them.",
      ),
      paragraph(
        "Choosing a password does not undo a deactivation either — only ",
        s(action.restore),
        " does.",
      ),
    ],
  },
  {
    id: "recover-email",
    question: "How do I recover somebody's email access?",
    answer: [
      paragraph(
        "Use ",
        s(action.recover),
        " when somebody can no longer reach the address they sign in with. It is not the way " +
          "to fix a typo on an invitation that is still pending — that is ",
        s(action.correct),
        ".",
      ),
      points(
        ["A reason is required."],
        [
          "The replacement address is sent a link to confirm, and the old sign-in stops " +
            "working immediately, so their access reads ",
          s(stateLabel("email_change_pending")),
          " until they confirm it.",
        ],
        [
          "The person, the roles they hold, their history and their record are all unchanged. " +
            "Recovery restores somebody's access; it moves no authority.",
        ],
      ),
      paragraph(
        "Nobody may recover their own address. An administrator who can still reach their own " +
          "mailbox uses ",
        s("Forgot password?"),
        " on the sign-in page instead.",
      ),
    ],
  },
  {
    id: "one-person-many-capacities",
    question: "Somebody is a player and a coach. Do they need two accounts?",
    answer: [
      paragraph(
        "No. One person has one record and at most one sign-in, however many capacities they " +
          "hold at once. A returning player who becomes a coach or an officer keeps the same " +
          "record they already had.",
      ),
      points(
        ["Playing membership runs by season and is managed on the Roster."],
        ["The sign-in is that person's single login, whatever they do for the club."],
        ["Roles are held separately from both, and may overlap."],
      ),
      paragraph(
        "What somebody can do is everything their current roles allow, taken together. " +
          "Inviting a person the club already knows links that same record — it never creates " +
          "a second one for the new capacity.",
      ),
    ],
  },
  {
    id: "operating-year",
    question: "Which operating year does an assignment belong to?",
    answer: [
      paragraph(
        "The club has one active operating year, and routine assignments inherit it. That is " +
          "why the forms neither ask for it nor repeat it.",
      ),
      points(
        [
          "Every seat shows the year in progress. There is no year switcher in this version, " +
            "and no screen here can change an earlier year.",
        ],
        [
          "What happened in an earlier year is on the seat's own page, under ",
          s(HOLDER_HISTORY),
          " — it covers this year and past years.",
        ],
        [
          "The General Manager and the IT Officer are standing seats: they carry across years " +
            "rather than belonging to one.",
        ],
        ["A seat shows one year at a time and never mixes them."],
      ),
      paragraph("Creating an operating year, or closing one, is not done here."),
    ],
  },
  {
    id: "who-may-administer",
    question: "Who may administer whom?",
    answer: [
      paragraph(
        "Three roles administer operators and assignments: President, General Manager and IT " +
          "Officer. The Vice-President and the Secretary are full operators, but they do not " +
          "administer accounts or roles.",
      ),
      points(
        ["The General Manager may administer the President."],
        [
          "The President and the IT Officer may not administer the General Manager. No role in " +
            "the application may assign, replace, end or deactivate that seat — changing it is " +
            "an exceptional recovery handled outside the application.",
        ],
        [
          "The IT Officer may not manage the President's assignment either. Only the General " +
            "Manager may.",
        ],
        [
          "The IT Officer may nevertheless recover email access for the President or the " +
            "General Manager. Recovery restores somebody's access without moving any " +
            "authority, so it is permitted in exactly the places where managing the seat is " +
            "not.",
        ],
        [
          "Nobody may act on their own account: not ending your own role, not deactivating " +
            "yourself, not recovering your own address.",
        ],
      ),
    ],
  },
  {
    id: "audit-history",
    question: "Where do I see what happened?",
    answer: [
      paragraph(
        "In two places, over one record. An operator's page shows ",
        s(OPERATOR_AUDIT_HISTORY),
        "; a seat's page shows ",
        s(HOLDER_HISTORY),
        ".",
      ),
      paragraph(
        "A change of holder appears in both. That is one recorded event read two ways, not two " +
          "separate records that could disagree.",
      ),
      points(
        [
          "Each entry names who made the change, the authority they held at the time, the " +
            "operating year, what changed, and the reason where one was required.",
        ],
        [
          "Nothing can be edited or removed. A correction is a new entry, and the original " +
            "stays visible.",
        ],
      ),
    ],
  },
  {
    id: "refusals",
    question: "Why was an action refused?",
    answer: [
      paragraph(
        "A refusal says what the action requires. It never says what you hold, and never says " +
          "what anybody else holds. There are four ordinary reasons.",
      ),
      points(
        [s("It is your own account."), " Ask another administrator to make the change."],
        [
          s("The seat is protected."),
          " Only the General Manager may administer the President, and no role may administer " +
            "the General Manager.",
        ],
        [
          s("It would leave the club with nobody able to administer."),
          " That includes an ending dated in the future which would leave nobody from that " +
            "date onwards. Give somebody else an administration role first, then make the " +
            "change.",
        ],
        [
          s("It has already happened, or it would change nothing."),
          " An assignment that has already ended, an account that is already deactivated, or " +
            "an invitation for somebody who is already ",
          s(stateLabel("active")),
          ".",
        ],
      ),
    ],
  },
  {
    id: "escalation",
    question: "What if I still cannot do what the club needs?",
    answer: [
      points(
        [
          "Check first whether a different seat is the one that may act. Most refusals mean " +
            "the change belongs to somebody else — the General Manager for the President's " +
            "seat, or any other administrator for your own account.",
        ],
        [
          "Changing who the General Manager is, and setting up the club's first " +
            "administrators, are deliberately outside the application. They are exceptional " +
            "procedures, arranged with whoever looks after the club's systems.",
        ],
        [
          "The list of roles, and what each role is allowed to do, are fixed. Changing either " +
            "is a reviewed change to the application rather than something done here.",
        ],
      ),
    ],
  },
]);

/** One run as plain text. */
export function guideRunText(run: GuideRun): string {
  return typeof run === "string" ? run : run.strong;
}

/** One block as plain text, blocks joined by a space. */
export function guideBlockText(block: GuideBlock): string {
  if (block.kind === "paragraph") return block.runs.map(guideRunText).join("");
  return block.items.map((item) => item.map(guideRunText).join("")).join(" ");
}

/**
 * The whole guide as one string — every question and every answer.
 *
 * This is what `content.test.ts` asserts the prohibitions over. It exists so
 * that "the guide contains no such procedure" is a check over the guide rather
 * than a check over the parts of it somebody remembered to look at.
 */
export function guideText(entries: readonly GuideEntry[] = ADMINISTRATION_GUIDE): string {
  return entries
    .flatMap((entry) => [entry.question, ...entry.answer.map(guideBlockText)])
    .join("\n");
}
