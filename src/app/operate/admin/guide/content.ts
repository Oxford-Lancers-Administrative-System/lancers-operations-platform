import { OPERATOR_ACCOUNT_STATE_DEFINITIONS } from "@/lib/services/operator-account-state";

// The words of the How administration works guide — LAN-134,
// M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-club-operating-guide`,
// `DEC-in-app-administration-guide`. Copy is data, not markup, so
// `content.test.ts` can assert the no-SQL/no-callout prohibition over the
// flattened whole (guideText()). State labels are imported from
// operator-account-state.ts, never retyped.

/** A run of answer text. `strong` is used only for a label the reader clicks or sees. */
export type GuideRun = string | { readonly strong: string };

interface GuideParagraph {
  readonly kind: "paragraph";
  readonly runs: readonly GuideRun[];
}

interface GuideList {
  readonly kind: "steps" | "points";
  readonly items: readonly (readonly GuideRun[])[];
}

export type GuideBlock = GuideParagraph | GuideList;

export interface GuideEntry {
  readonly id: string;
  readonly question: string;
  readonly answer: readonly GuideBlock[];
}

/** The page's own title and one line of context, matching the prototype. */
export const GUIDE_TITLE = "How administration works";
export const GUIDE_SUBTITLE = "Answers for routine operator and role administration";

/** Exactly as `DEC-administration-language-and-states` fixes them. */
export const OPERATOR_AUDIT_HISTORY = "Operator audit history";
export const HOLDER_HISTORY = "Holder history";

/** The button labels, not paraphrases — a mismatch sends the reader hunting for a control that isn't there. */
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

// The guide, in the order it is read — the requirement's own order: five
// workflows, four explanations, refusals and escalation last.
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

/**
 * Compliance and user protections — LAN-467 (Stu, 2 October 2026). Built as
 * one section at the foot of How administration works; since Brian's visual
 * review of 5 October 2026 it is its own guide page,
 * `/operate/admin/guide/compliance`, listed last in the guide, with the same
 * text: the page's title, then one section per heading below.
 *
 * A plain account of what the application does, for a reader at the club or
 * the university. It is not in `ADMINISTRATION_GUIDE`: it has to name
 * WhatsApp, which that list's prohibitions exist to keep out of the
 * administration answers. Every sentence is checked against the code it
 * describes; `content.test.ts` names each source. It deliberately states no
 * limit, threshold or address that would help somebody attack the public
 * pages, and it leaves who is responsible for the data, and for how long it is
 * kept, to the privacy notice that already says so.
 */
export const COMPLIANCE_TITLE = "Compliance and user protections";

/** The page's sections, in order; each `question` is its heading. */
export const COMPLIANCE_SECTIONS: readonly GuideEntry[] = Object.freeze([
  {
    id: "compliance-personal-data",
    question: "Personal data",
    answer: [
      points(
        [
          "The public ",
          s("Privacy notice"),
          " says what the platform holds and why, who is responsible for it, which services " +
            "it uses, how long information is kept, and how to make a request.",
        ],
        [
          "Each person has one record. Date of birth and emergency contact are restricted: " +
            "they are shown only to operators whose seat is given them, and never on a list.",
        ],
        [
          "When somebody asks for a copy of what the club holds about them, ",
          s("Export everything held about this person"),
          " on their record produces it as a file.",
        ],
        [
          "When somebody asks to be removed, ",
          s("Anonymise this person"),
          " takes their name, contact details and date of birth off the record, withdraws " +
            "their links and cancels their queued messages. It needs two confirmations from two " +
            "different people among the President, General Manager, Vice-President and " +
            "Secretary, and it cannot be undone.",
        ],
      ),
    ],
  },
  {
    id: "compliance-messages",
    question: "Messages",
    answer: [
      points(
        [
          "WhatsApp messages are sent only as templates Meta has approved, in Meta's Utility " +
            "category: messages about the club's own business, not marketing.",
        ],
        [
          "A recruit is messaged only while they have given consent for that season. Consent " +
            "is recorded per person, per season: by the recruit on the sign-up form, or by an " +
            "operator who has their agreement, and an operator's record never overrides a " +
            "withdrawal. A recruit can withdraw it with the ",
          s("Stop messages"),
          " link in their messages, and an operator can record a withdrawal for them.",
        ],
        [
          "When a recruit leaves the recruitment process or joins the roster, every message " +
            "still queued for them as a recruit is cancelled.",
        ],
        [
          "Reminders about an event stop as soon as the person has answered. The one exception " +
            "is the recruit reminder: a recruit who answered Yes to a recruitment event gets one " +
            "WhatsApp reminder before it, set in hours on the messaging schedule.",
        ],
      ),
    ],
  },
  {
    id: "compliance-time",
    question: "People's time",
    answer: [
      points(
        [
          "No automated message is sent between 22:00 and 07:00 UK time. A message due in " +
            "those hours waits until 07:00; it is held, not dropped. A recruit reminder that " +
            "07:00 would deliver after its event has started is not sent at all.",
        ],
        [
          "Only an event's cancellation, a change to an event, and a change to its questions " +
            "are sent at any hour, because the news cannot wait for the morning, and so is the " +
            "attendance sheet email an hour before an event, because an early event needs it " +
            "before 07:00.",
        ],
      ),
    ],
  },
  {
    id: "compliance-access",
    question: "Access and security",
    answer: [
      points(
        [
          "Every operator has their own account. They are invited by email and choose their " +
            "own password; nobody sets a password for somebody else, and there is no public " +
            "sign-up for operators.",
        ],
        [
          "What an operator may see and change comes from the club seats they hold, and each " +
            "seat's access is set area by area. Changes to who holds a seat are kept in a " +
            "history that cannot be edited.",
        ],
        [
          "An event response link opens one invitation for one person and carries nothing " +
            "that identifies them. Only a fingerprint of it is stored, so an issued link cannot " +
            "be read back by anybody. It stops working when the event starts, or when a newer " +
            "one replaces it.",
        ],
        ["The event link a coach shares with the team stops working seven days after the event."],
        [
          "The pages a personal link opens limit how many requests they accept, and an " +
            "unknown, expired or withdrawn response link gets the same reply as any other, so " +
            "trying links reveals nothing.",
        ],
        [
          "Every table the database exposes has row-level security switched on and refuses " +
            "access by default. The application checks permission itself before it reads or " +
            "changes anything; the database rule is the second line.",
        ],
      ),
    ],
  },
]);

/** One run as plain text. */
function guideRunText(run: GuideRun): string {
  return typeof run === "string" ? run : run.strong;
}

/** One block as plain text, blocks joined by a space. */
function guideBlockText(block: GuideBlock): string {
  if (block.kind === "paragraph") return block.runs.map(guideRunText).join("");
  return block.items.map((item) => item.map(guideRunText).join("")).join(" ");
}

/** Every question and answer, as one string — what `content.test.ts` asserts the prohibitions over. */
export function guideText(entries: readonly GuideEntry[] = ADMINISTRATION_GUIDE): string {
  return entries
    .flatMap((entry) => [entry.question, ...entry.answer.map(guideBlockText)])
    .join("\n");
}
