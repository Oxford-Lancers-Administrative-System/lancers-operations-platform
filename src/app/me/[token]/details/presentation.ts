/**
 * Every word `/me/[token]/details` says — LAN-216, W4 and W5.
 *
 * The shipped player-facing shell's own idiom: a `BANNER`, a `PRIVACY_NOTE`
 * rendered at the point of collection on every screen, and the uniform
 * `TERMINAL_*` dead-link copy with only its body sentence replaced (the
 * shipped one talks about events; this page is a collection link) — exactly
 * as `src/app/a/[token]/presentation.ts` and `src/app/me/[token]/presentation.ts`
 * already do for their own routes. `W4-09` photographs the one sentence that
 * has to change and nothing else.
 *
 * The Code of Conduct, the photo release, the BUCS Play steps and Hudl's
 * steps are all **labelled placeholder text in a real versioned slot** —
 * LAN-213 owes the real wording. Nothing below is invented club policy.
 */

export const BANNER = "LANCERS OPERATIONS";

export const PRIVACY_NOTE =
  "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.";

export const DOCUMENT_PRIVACY_NOTE =
  "Your agreement is recorded against the exact version shown here, with the date. It is yours, and only the four-role group can see it.";

// ---------------------------------------------------------------------------
// The uniform dead-link page — not-found.tsx
// ---------------------------------------------------------------------------

export const TERMINAL_HEADING = "This link can’t be used";
export const TERMINAL_BODY =
  "Request the latest message from the club. Whenever the club sends you a new one it carries your current link.";
export const TERMINAL_PRIVACY_NOTE =
  "For privacy, we can’t provide more information about this link.";
export const CLOSE = "Close";

export const BUSY_ERROR = "busy";
export const BUSY_MESSAGE =
  "Your response could not be saved just now because the club received a lot of requests at once. Please try again in a minute.";

// ---------------------------------------------------------------------------
// The checklist strip — the map of the sequence, at the top of every step
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step 1 — the details, the consent board
// ---------------------------------------------------------------------------

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
export const FIELD_PERSONAL_EMAIL = "Personal email";
export const FIELD_COLLEGE = "College";
export const FIELD_MATRICULATION_YEAR = "Matriculation year";
export const FIELD_EXPECTED_GRADUATION = "Expected graduation";
export const FIELD_DEGREE_FIELD = "Degree field";
export const FIELD_DATE_OF_BIRTH = "Date of birth";

export const FIELD_EC_GIVEN_NAME = "Emergency contact first name";
export const FIELD_EC_FAMILY_NAME = "Emergency contact last name";
export const FIELD_EC_RELATIONSHIP = "Relationship to you";
export const FIELD_EC_PHONE = "Emergency contact phone";
export const FIELD_EC_EMAIL = "Emergency contact email";

/**
 * F4 (LAN-230): this used to append "· a change here is checked by a person"
 * to every `"club"` source line — the disputed-fact mechanism's own copy,
 * retired by Q-9 ("I don't think the disputed fact mechanism survives at
 * all"). The save path has been last-write-wins since that decision; nothing
 * is checked before a player's own answer takes effect, so the line said
 * something false. `who` is now also read from the value's real supplier
 * (`QuestionnaireView.fieldSuppliedBy`) rather than hard-coded per field name.
 */
export function sourceLine(who: "you" | "club", date: string | null): string {
  const base = who === "you" ? "You" : "The club";
  return date ? `${base}, ${date}` : base;
}

export const SAVE_AND_CONTINUE = "Save and continue";
export const DETAILS_SECONDARY =
  "You can leave and come back to this link. What you have entered is kept.";
export const SAVE_CHANGES = "Save changes";
export const RETURNING_SECONDARY =
  "Anything the club needs to change itself, it changes its own way.";

export const DISPUTED_NOTICE =
  "This differs from what the club has on file. Both values are kept, and a person will check before anything changes — you are not blocked while that happens.";

// ---------------------------------------------------------------------------
// Steps 2 and 3 — the two documents
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step 4 — BUCS Play
// ---------------------------------------------------------------------------

export const BUCS_HEADING = "Register on BUCS Play";
export const BUCS_LEAD = "Step 4 of 5 · Do these, then tell us";
export const BUCS_STEPS: readonly string[] = [
  "PLACEHOLDER STEP. Download the BUCS Play app. The real copy names the store and carries the link.",
  "PLACEHOLDER STEP. Register with your Oxford email address, not a personal one.",
  "PLACEHOLDER STEP. Search for Oxford Lancers and select the club.",
  "PLACEHOLDER STEP. Complete whatever BUCS asks you for. This has to be done again every year.",
];
export const BUCS_OWED_NOTE =
  "PLACEHOLDER. These steps stand in for instruction copy this mission owes and nobody has written yet (LAN-213). They block no build and no walk; they block a real send.";
export const BUCS_HAVE_YOU_DONE_IT = "Have you done it?";
export const BUCS_CLAIM_LABEL = "Yes — I have registered on BUCS Play and selected Oxford Lancers.";
export const CONTINUE = "Continue";

// F3 (LAN-230), `W4-05-proposed`: the two-column status box above the steps,
// and the two footer notes — none of the three existed. `BUCS_CONFIRMED_BY`
// and `BUCS_INSTRUCTIONS_STATUS` are constant, not per-player: the two-stage
// confirmation shape (the player claims, the compliance owner confirms
// against the roster in `W6`) and the placeholder instruction copy are both
// true of this item regardless of who is looking at it.
export const BUCS_STATUS_CONFIRMED_BY_LABEL = "Confirmed by";
export const BUCS_STATUS_CONFIRMED_BY = "You, then the club";
export const BUCS_STATUS_INSTRUCTIONS_LABEL = "Instructions";
export const BUCS_STATUS_INSTRUCTIONS = "Owed — not written";
export const BUCS_CLAIM_SUBNOTE =
  "This records claimed, not complete. The compliance owner confirms it against the BUCS roster, and W6 is where that happens.";
export const BUCS_CONTINUE_ANYWAY_NOTE =
  "If you have not done it yet, continue anyway. The club will ask you again.";

// ---------------------------------------------------------------------------
// Step 5 — Hudl
// ---------------------------------------------------------------------------

export const HUDL_HEADING = "Get into Hudl";
export const HUDL_LEAD = "Step 5 of 5 · Accept your invitation";
export const HUDL_TWO_PARTS_NOTE =
  "This one has two halves and the club owns the first. An operator sends your invitation; you accept it. If it never arrived, say so below rather than working around it.";
export const HUDL_STEPS: readonly string[] = [
  "PLACEHOLDER STEP. Look for an invitation email from Hudl, sent to the address the club holds for you.",
  "PLACEHOLDER STEP. Follow the link in it and set up your Hudl account.",
  "PLACEHOLDER STEP. Confirm you can see the Oxford Lancers team once you are in.",
];
export const HUDL_OWED_NOTE =
  "PLACEHOLDER. The email-invite method is assumed. The real instruction copy is owed under LAN-213 and nobody has written it.";
export const HUDL_ARE_YOU_IN = "Are you in?";
export const HUDL_CLAIM_LABEL = "Yes — I have accepted the invitation and I can see the team.";
export const HUDL_NO_INVITATION_LABEL = "No invitation has reached me.";
export const FINISH = "Finish";

// ---------------------------------------------------------------------------
// Done — outstanding by section
// ---------------------------------------------------------------------------

export const DONE_HEADING = "That is all saved";
export const OUTSTANDING_HEADING = "Still outstanding";
export const OUTSTANDING_SAME_LINK_NOTE =
  "Every one of these is on the link you are already holding. The club will ask you for them here — it will not send you a second link.";

// F3 (LAN-230), `W4-07-proposed`: the status chip, the person/date line, the
// "What the club now has" and "If something here is wrong" sections, the
// Close button and the R3-G reassurance line all existed nowhere in the
// codebase. `IF_SOMETHING_WRONG_BODY` is written to the mechanism as it
// stands today (Q-9, last-write-wins) rather than to the mockup's own text,
// which still carries the retired disputed-fact clause ("a change here is
// checked by a person") F4 removes elsewhere on this same route — repeating
// it here would reintroduce the exact defect this package fixes. See the PR
// for that one named departure from the mockup's literal wording.
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

// ---------------------------------------------------------------------------
// Already complete — nothing outstanding, no sequence
// ---------------------------------------------------------------------------

export const ALREADY_COMPLETE_HEADING = "There is nothing left to fill in";
export const ALREADY_COMPLETE_REST_NOTE =
  "Subscriptions, kit, the squad photo and the messaging groups are the club's to tick off, not yours. You will not be asked about them here.";
export const ALREADY_COMPLETE_CHANGE_NOTE =
  "If something on your record has changed, open this link again and correct it. It stays yours for the whole season, and it is the only link the club will ever send you.";
