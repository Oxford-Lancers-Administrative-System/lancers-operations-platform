/**
 * Every word `/me/[token]/details` says — LAN-216, W4 and W5.
 *
 * The Code of Conduct and the photo release are still labelled placeholder
 * text in a real versioned slot; LAN-213 owes that wording. **The BUCS Play
 * and Hudl steps are the club's own, since LAN-333** — Brian gave them on
 * 2026-09-11, and they replaced four and three invented placeholder lines
 * whose assumed Hudl email-invite flow was simply wrong. Two things in them
 * are not copy and must not become copy: the BUCS league is season-stamped,
 * so its year is derived from the open season's label rather than typed; and
 * the Hudl join link is configuration (`HUDL_JOIN_LINK`, read through
 * `src/lib/services/player-config.ts`), because this repository is public.
 * Nothing below is invented club policy.
 */

export const PRIVACY_NOTE =
  "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.";

export const DOCUMENT_PRIVACY_NOTE =
  "Your agreement is recorded against the exact version shown here, with the date. It is yours, and only the four-role group can see it.";

// The uniform dead-link page — not-found.tsx

export const TERMINAL_HEADING = "This link can’t be used";
export const TERMINAL_BODY =
  "Request the latest message from the club. Whenever the club sends you a new one it carries your current link.";
export const TERMINAL_PRIVACY_NOTE =
  "For privacy, we can’t provide more information about this link.";
export const CLOSE = "Close";

export const BUSY_MESSAGE =
  "Your response could not be saved just now because the club received a lot of requests at once. Please try again in a minute.";

// The checklist strip — the map of the sequence, at the top of every step

export function stepLabel(step: string): string {
  switch (step) {
    case "details":
      return "Your details";
    case "code_of_conduct":
      return "Code of Conduct";
    case "photo_release":
      return "Photo release";
    case "bucs_play":
      return "BUCS Play";
    case "hudl":
      return "Hudl";
    default:
      return step;
  }
}

// Step 1 — the details, the consent board

export const DETAILS_HEADING = "Welcome to the team";
export const DETAILS_LEAD_STEP = "Step 1 of 5 · Your details";
export const DETAILS_LEAD_RETURNING = "Change anything that has changed";

export const CONSENT_HEADING = "Messaging consent";
export const CONSENT_LABEL = "Yes, Oxford Lancers may message me about the club this season.";
export const CONSENT_ALREADY_GRANTED = "Messaging consent: Already agreed.";

export const REQUIRED_NOTE = "* is required. This is the required form.";

export const SECTION_WHO_YOU_ARE = "Who you are";
export const SECTION_WHERE_YOU_STUDY = "Where you study";
export const SECTION_KEPT_PRIVATE = "Kept private";
export const SECTION_EMERGENCY_CONTACT = "Emergency contact";

export const FIELD_GIVEN_NAME = "First name";
export const FIELD_FAMILY_NAME = "Last name";
export const FIELD_MOBILE = "Mobile phone";
/** LAN-268. Proof of university affiliation — required with name/phone, not the academic fields. */
export const FIELD_COLLEGE_EMAIL = "College email";
export const FIELD_COLLEGE_EMAIL_HINT = "Your university address — it ends in ox.ac.uk.";
export const FIELD_PERSONAL_EMAIL = "Personal email";
export const FIELD_COLLEGE = "College";
export const FIELD_MATRICULATION_YEAR = "Matriculation year";
export const FIELD_EXPECTED_GRADUATION = "Expected graduation";
export const FIELD_DEGREE_FIELD = "Degree field";
export const FIELD_DATE_OF_BIRTH = "Date of birth";

/** LAN-267's two identifiers. Neither required — a player who doesn't know their BAFA number yet is not blocked. */
export const SECTION_GAME_DAY = "For game day";
export const SECTION_GAME_DAY_NOTE =
  "The officials' roster form asks for these at every game. Leave either blank if you do not have it yet.";
export const FIELD_STUDENT_NUMBER = "Student number";
export const FIELD_BAFA_NUMBER = "BAFA registration number";

export const FIELD_EC_GIVEN_NAME = "Emergency contact first name";
export const FIELD_EC_FAMILY_NAME = "Emergency contact last name";
export const FIELD_EC_RELATIONSHIP = "Relationship to you";
export const FIELD_EC_PHONE = "Emergency contact phone";
export const FIELD_EC_EMAIL = "Emergency contact email";

/** F4 (LAN-230): no longer appends the retired disputed-fact clause (Q-9) — save is last-write-wins, so that line was false. */
export function sourceLine(who: "you" | "club", date: string | null): string {
  const base = who === "you" ? "You" : "The club";
  return date ? `${base}, ${date}` : base;
}

export const SAVE_AND_CONTINUE = "Save and continue";
export const DETAILS_SECONDARY =
  "You can leave and come back to this link. What you have entered is kept.";
export const SAVE_CHANGES = "Save changes";

export const DISPUTED_NOTICE =
  "This differs from what the club has on file. Both values are kept, and a person will check before anything changes — you are not blocked while that happens.";

// Steps 2 and 3 — the two documents

export const CODE_OF_CONDUCT_HEADING = "The Code of Conduct";
export const CODE_OF_CONDUCT_LEAD = "Step 2 of 5 · Read it, then agree";
export const CODE_OF_CONDUCT_AGREE_LABEL = "I have read and I agree to the Code of Conduct.";

export const PHOTO_RELEASE_HEADING = "The photo release";
export const PHOTO_RELEASE_LEAD = "Step 3 of 5 · Read it, then agree";
export const PHOTO_RELEASE_AGREE_LABEL =
  "I have read the photo release and I agree to it for this season.";

export const AGREE_AND_CONTINUE = "I agree — continue";
export const MUST_AGREE_ERROR = "Read the document, then tick the box to continue.";

export const PLACEHOLDER_LABEL = "PLACEHOLDER WORDING — the real text is owed under LAN-213";

// Step 4 — BUCS Play

export const BUCS_HEADING = "Register on BUCS Play";
export const BUCS_LEAD = "Step 4 of 5 · Do these, then tell us";

/** One numbered instruction, and whatever destinations it names. A link is rendered as a link, never pasted into the sentence. */
export interface InstructionStep {
  readonly text: string;
  readonly links?: readonly { readonly label: string; readonly href: string }[];
}

/** Public store listings for both products — not club configuration, and safe as literals. */
const BUCS_PLAY_APPLE = "https://apps.apple.com/gb/app/bucs-play/id1379011950";
const BUCS_PLAY_ANDROID = "https://play.google.com/store/apps/details?id=com.playwaze.bucscore";
const BUCS_PLAY_WEB = "https://bucs.playwaze.com";
const HUDL_APPLE = "https://apps.apple.com/us/app/hudl/id412223222";
const HUDL_ANDROID = "https://play.google.com/store/apps/details?id=com.hudl.hudroid";

/**
 * The league's own year, as BUCS stamps it: "26-27" from the open season's
 * "2026-27" (or "2026/27" — both spellings appear). Derived rather than typed,
 * because a constant would name last year's league from the first day of the
 * next season and nobody would be looking. A label it cannot read drops the
 * year from the sentence rather than guessing one; the league is still
 * findable without it.
 */
export function bucsLeagueYear(seasonLabel: string | null): string | null {
  const years = seasonLabel?.match(/\d{2,4}/g);
  if (!years || years.length < 2) return null;
  return `${years[0].slice(-2)}-${years[1].slice(-2)}`;
}

/** The club's own BUCS Play steps (Brian, 2026-09-11 — LAN-333). */
export function bucsSteps(seasonLabel: string | null): readonly InstructionStep[] {
  const year = bucsLeagueYear(seasonLabel);
  return [
    {
      text: "Download the BucsPlay app, or use the website instead.",
      links: [
        { label: "Apple", href: BUCS_PLAY_APPLE },
        { label: "Android", href: BUCS_PLAY_ANDROID },
        { label: "bucs.playwaze.com", href: BUCS_PLAY_WEB },
      ],
    },
    { text: "Create an account using your college email address." },
    { text: "Join the BUCS general community first, filling in your details." },
    { text: "Then search “Oxford Open 1 American Football”." },
    {
      text: year
        ? `Request to join Oxford Open 1, making sure it is in the BUCS American Football ${year} league.`
        : "Request to join Oxford Open 1, making sure it is the BUCS American Football league for this season.",
    },
  ];
}

export const BUCS_HAVE_YOU_DONE_IT = "Have you done it?";
export const BUCS_CLAIM_LABEL = "Yes — I have registered on BUCS Play and selected Oxford Lancers.";
export const CONTINUE = "Continue";

// F3 (LAN-230), W4-05-proposed. Constant, not per-player: true of this item regardless of who is looking.
export const BUCS_STATUS_CONFIRMED_BY_LABEL = "Confirmed by";
export const BUCS_STATUS_CONFIRMED_BY = "You, then the club";
export const BUCS_STATUS_INSTRUCTIONS_LABEL = "Instructions";
/** LAN-333 wrote them. The row read "Owed — not written", which was true and is not any more. */
export const BUCS_STATUS_INSTRUCTIONS = "On this page";
export const BUCS_CLAIM_SUBNOTE =
  "This records claimed, not complete. The compliance owner confirms it against the BUCS roster, and W6 is where that happens.";
export const BUCS_CONTINUE_ANYWAY_NOTE =
  "If you have not done it yet, continue anyway. The club will ask you again.";

// Step 5 — Hudl

export const HUDL_HEADING = "Get into Hudl";
/** LAN-333 reversed the assumed flow: Hudl is self-serve from a join link and the club sends nothing, so there is no invitation to accept. */
export const HUDL_LEAD = "Step 5 of 5 · Join the team, then tell us";

export const HUDL_JOIN_LINK_LABEL = "Join the Oxford Lancers on Hudl";
/** The one state an unconfigured deployment shows. The steps stay; only the link is absent, and it is named rather than invented. */
export const HUDL_LINK_NOT_PUBLISHED =
  "The join link is not published yet. Ask anybody at the club.";

/** The club's own Hudl steps (Brian, 2026-09-11 — LAN-333). `joinLink` is `null` until the deployment is configured. */
export function hudlSteps(joinLink: string | null): readonly InstructionStep[] {
  return [
    {
      text: "Go to the club's Hudl join link.",
      links: joinLink ? [{ label: HUDL_JOIN_LINK_LABEL, href: joinLink }] : undefined,
    },
    { text: "Follow the steps to create an account if you do not have one." },
    {
      text: "On the “about your info” screen, enter what you have and press submit. The phone number field can be left alone.",
    },
    {
      text: "For convenience, download the app.",
      links: [
        { label: "Apple", href: HUDL_APPLE },
        { label: "Android", href: HUDL_ANDROID },
      ],
    },
  ];
}

export const HUDL_ARE_YOU_IN = "Are you in?";
export const HUDL_CLAIM_LABEL = "Yes — I have joined and I can see the team.";
export const FINISH = "Finish";

// Done — outstanding by section

export const DONE_HEADING = "That is all saved";
export const OUTSTANDING_HEADING = "Still outstanding";
export const OUTSTANDING_SAME_LINK_NOTE =
  "Every one of these is on the link you are already holding. The club will ask you for them here — it will not send you a second link.";

// F3 (LAN-230), W4-07-proposed. `IF_SOMETHING_WRONG_BODY` matches the mechanism as it stands (Q-9, last-write-wins), not the mockup's retired disputed-fact clause.
export const DONE_STATUS_LABEL = (seasonLabel: string | null): string =>
  seasonLabel ? `Onboarding · ${seasonLabel}` : "Onboarding";
export const WHAT_CLUB_HAS_HEADING = "What the club now has";
export const WHAT_CLUB_HAS_BODY =
  "Your consent, your contact details, your college and course, your date of birth and your emergency contact — along with the Code of Conduct and the photo release, each recorded against the version you saw.";
export const IF_SOMETHING_WRONG_HEADING = "If something here is wrong";
export const IF_SOMETHING_WRONG_BODY =
  "Open this link again at any time and change it. It stays yours for the whole season, and what you save simply takes effect.";
export const R3G_REASSURANCE =
  "Nothing on your checklist ever blocks you from training, playing or travelling.";

// Already complete — nothing outstanding, no sequence

export const ALREADY_COMPLETE_HEADING = "There is nothing left to fill in";
export const ALREADY_COMPLETE_REST_NOTE =
  "Subscriptions, kit, the squad photo and the messaging groups are the club's to tick off, not yours. You will not be asked about them here.";
export const ALREADY_COMPLETE_CHANGE_NOTE =
  "If something on your record has changed, open this link again and correct it. It stays yours for the whole season, and it is the only link the club will ever send you.";
