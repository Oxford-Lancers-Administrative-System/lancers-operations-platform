import { describe, expect, it } from "vitest";

import { OPERATOR_ACCOUNT_STATE_DEFINITIONS } from "@/lib/services/operator-account-state";
import {
  ADMINISTRATION_ACTION_LABELS,
  ADMINISTRATION_GUIDE,
  guideText,
  HOLDER_HISTORY,
  OPERATOR_AUDIT_HISTORY,
  type GuideEntry,
} from "./content";

/**
 * The guide's **words** — LAN-134, `REQ-club-operating-guide`.
 *
 * These assertions are the reason `content.ts` is data rather than markup. The
 * requirement's last sentence is a prohibition on what the text may contain,
 * and a prohibition is only real if something checks it: a guide that acquired
 * a "if that does not work, open the database and…" paragraph in six months
 * would otherwise sail through review, because it would read perfectly
 * sensibly.
 *
 * Three families here, and each fails for a different reason:
 *
 *   * **the prohibition** — the five procedures the requirement bans;
 *   * **the vocabulary** — `DEC-administration-language-and-states`, which bans
 *     three technical labels and fixes the state, action and projection names;
 *   * **the coverage** — the topics the requirement enumerates, so that an
 *     entry deleted for being awkward to word fails rather than disappears.
 */

const text = guideText();
const lower = text.toLowerCase();

describe("the prohibition REQ-club-operating-guide places on this page", () => {
  // Each pattern is the *procedure* the requirement names, matched loosely
  // enough that a paraphrase is caught too. They are deliberately not anchored
  // to whole words: "SQL" inside "PostgreSQL" is exactly as forbidden.
  const forbidden: readonly { readonly what: string; readonly pattern: RegExp }[] = [
    { what: "SQL", pattern: /\bsql\b|postgres|psql|\bquery the\b|\bdatabase console\b/i },
    {
      what: "a Supabase-dashboard procedure",
      pattern: /supabase|dashboard|studio|\badmin panel\b/i,
    },
    {
      what: "an administrator-created-password procedure",
      pattern:
        /\bset (?:their|a|the user'?s?) password\b|\bcreate a password for\b|\bgive them a password\b|\btemporary password\b|\bchoose a password for\b/i,
    },
    { what: "a WhatsApp-authentication procedure", pattern: /whatsapp/i },
    // The requirement bans callouts as a *treatment*, which `guide-faq.tsx`
    // honours structurally. This catches the text half — a paragraph that tells
    // somebody to read a banner implies one exists.
    { what: "a callout", pattern: /\bcallout\b|\bbanner\b/i },
  ];

  it.each(forbidden)("contains no $what", ({ pattern }) => {
    expect(text).not.toMatch(pattern);
  });

  it("never sends the reader outside the application to finish an ordinary task", () => {
    // The escalation entry is allowed to say a thing is not done here. It is not
    // allowed to say how it is done elsewhere.
    expect(lower).not.toContain("command");
    expect(lower).not.toContain("terminal");
    expect(lower).not.toContain("script");
    expect(lower).not.toContain("migration");
  });
});

describe("DEC-administration-language-and-states", () => {
  it.each(["durable person", "effective access", "access history"])(
    "does not use the technical label %j",
    (banned) => {
      expect(lower).not.toContain(banned);
    },
  );

  it("names both audit projections exactly", () => {
    expect(text).toContain(OPERATOR_AUDIT_HISTORY);
    expect(text).toContain(HOLDER_HISTORY);
  });

  it("uses every approved operator state label, and no invented one", () => {
    for (const definition of Object.values(OPERATOR_ACCOUNT_STATE_DEFINITIONS)) {
      expect(text).toContain(definition.label);
    }
  });

  it("takes the state labels from the service layer rather than retyping them", () => {
    // If somebody replaces the import with a literal, this still passes — but
    // the guard that matters is the opposite direction: a state renamed in the
    // service layer must change here too, and it can only do that through the
    // import. Asserted by using the imported value as the expectation.
    const active = OPERATOR_ACCOUNT_STATE_DEFINITIONS.active.label;
    expect(active).toBe("Active");
    expect(text).toContain(active);
  });

  it("uses the approved action labels", () => {
    for (const label of Object.values(ADMINISTRATION_ACTION_LABELS)) {
      expect(text).toContain(label);
    }
  });

  it("pins the action labels to the words the decision fixes", () => {
    expect(ADMINISTRATION_ACTION_LABELS.replace).toBe("Replace role");
    expect(ADMINISTRATION_ACTION_LABELS.end).toBe("End role");
    expect(ADMINISTRATION_ACTION_LABELS.deactivate).toBe("Deactivate operator access");
    expect(ADMINISTRATION_ACTION_LABELS.restore).toBe("Restore operator access");
  });
});

describe("the topics REQ-club-operating-guide enumerates", () => {
  const required: readonly { readonly topic: string; readonly id: string }[] = [
    { topic: "inviting someone", id: "invite" },
    { topic: "resending an invitation", id: "resend-invitation" },
    { topic: "assigning and replacing a role", id: "assign-replace-role" },
    { topic: "ending a role", id: "end-role" },
    { topic: "deactivating and restoring access", id: "deactivate-restore-access" },
    { topic: "recovering email access", id: "recover-email" },
    { topic: "combined player/operator/role identity", id: "one-person-many-capacities" },
    { topic: "active, past and future year behaviour", id: "operating-year" },
    { topic: "the hierarchy", id: "who-may-administer" },
    { topic: "the audit projections", id: "audit-history" },
    { topic: "refusals", id: "refusals" },
    { topic: "escalation", id: "escalation" },
  ];

  it.each(required)("answers $topic", ({ id }) => {
    const entry = ADMINISTRATION_GUIDE.find((candidate) => candidate.id === id);
    expect(entry, `no guide entry with id ${id}`).toBeDefined();
    expect((entry as GuideEntry).answer.length).toBeGreaterThan(0);
  });

  it("has a stable, unique id and a question for every entry", () => {
    const ids = ADMINISTRATION_GUIDE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ADMINISTRATION_GUIDE) {
      expect(entry.question.endsWith("?")).toBe(true);
    }
  });
});

/**
 * The behaviours the brief singled out as genuinely surprising. Each one is
 * written from the merged service layer, and each is the kind of sentence an
 * editor would "tidy" into its opposite.
 */
describe("the rules an administrator will otherwise get wrong", () => {
  const answerFor = (id: string) => {
    const entry = ADMINISTRATION_GUIDE.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`no guide entry with id ${id}`);
    return guideText([entry]);
  };

  it("says deactivating access is not ending a role, and creates no vacancy", () => {
    const answer = answerFor("deactivate-restore-access");
    expect(answer).toMatch(/changes no role/i);
    expect(answer).toMatch(/no vacancy appears/i);
    expect(answerFor("end-role")).toMatch(/only action that leaves a seat unfilled/i);
  });

  it("says restoring returns only what is still in force", () => {
    expect(answerFor("deactivate-restore-access")).toMatch(
      /seat that ended while they were deactivated does not come back/i,
    );
  });

  it("states the hierarchy asymmetrically, including the recovery exception", () => {
    const answer = answerFor("who-may-administer");
    expect(answer).toMatch(/General Manager may administer the President/i);
    expect(answer).toMatch(/may not administer the General Manager/i);
    // The asymmetry itself: recovery is permitted where management is not.
    expect(answer).toMatch(/recover email access for the President or the General Manager/i);
    expect(answer).toMatch(/without moving any authority/i);
  });

  it("says nobody may act on their own account", () => {
    expect(answerFor("who-may-administer")).toMatch(/Nobody may act on their own account/i);
    expect(answerFor("recover-email")).toMatch(/Nobody may recover their own address/i);
  });

  it("explains the final-administrator refusal, including a future-dated ending", () => {
    expect(answerFor("refusals")).toMatch(
      /leave the club with nobody able to administer[\s\S]*dated in the future/i,
    );
  });

  it("gives the escape for an invitation that was opened and abandoned", () => {
    const answer = answerFor("resend-invitation");
    expect(answer).toMatch(/opened the invitation link but never chose a password/i);
    expect(answer).toMatch(/Forgot password\?/);
    // And says why that is enough, rather than leaving it as a workaround.
    expect(answer).toMatch(/finishes setting up the account/i);
  });

  it("says one person keeps one record and one login across capacities", () => {
    const answer = answerFor("one-person-many-capacities");
    expect(answer).toMatch(/one record and at most one sign-in/i);
    expect(answer).toMatch(/never creates a second one/i);
  });

  it("says the administrator never sets somebody else's password", () => {
    expect(answerFor("invite")).toMatch(/never set somebody else's password/i);
    expect(answerFor("invite")).toMatch(/no public sign-up/i);
  });
});
