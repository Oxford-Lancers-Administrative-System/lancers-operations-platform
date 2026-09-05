import { describe, expect, it } from "vitest";
import {
  allowedItemStates,
  isDerivedItem,
  itemStateLabel,
  KIT_DISTRIBUTED_ITEM_CODE,
  SUBS_INVOICED_ITEM_CODE,
  SUBS_PAID_ITEM_CODE,
} from "./onboarding-item-shapes";

/**
 * D-002 (correction round 6, `WP-operator-record`, LAN-217): **one state
 * list per item** — the same list a cell may show and its own control may
 * choose from. There is no separate "resolution" vocabulary, no shared
 * escape hatch (`waived`/`not_applicable` layered onto every item), and no
 * `reopen`. The previous brief that told the implementer otherwise — "Waived
 * and Not applicable stay available on every item as the operator's escape
 * hatch, and reopen from any terminal state is unchanged" — was never
 * Brian's decision.
 *
 * These are Brian's own exact lists, from the correction brief's table.
 */
describe("allowedItemStates — Brian's exact per-item lists, nothing else", () => {
  it("is Invoiced/Not invoiced for Subscription invoiced — no Waived, no Not applicable, no Reopen", () => {
    expect(allowedItemStates(SUBS_INVOICED_ITEM_CODE)).toEqual(["pending", "complete"]);
  });

  it("is Not paid/Paid/Waived for Subscription paid — the one item Waived still applies to", () => {
    expect(allowedItemStates(SUBS_PAID_ITEM_CODE)).toEqual(["pending", "complete", "waived"]);
  });

  it("is Yes/No for Kit Distributed, Squad photo, Code of Conduct and Photo release", () => {
    for (const code of [KIT_DISTRIBUTED_ITEM_CODE, "photo", "code_of_conduct", "photo_release"]) {
      expect(allowedItemStates(code)).toEqual(["pending", "complete"]);
    }
  });

  it("is Not assigned/Assigned and invited/In the group for Comms group", () => {
    expect(allowedItemStates("comms_groups")).toEqual(["pending", "invited", "complete"]);
  });

  it("is Not invited/Invited/Claimed for Hudl access — three states, no Confirmed", () => {
    expect(allowedItemStates("hudl_access")).toEqual(["pending", "invited", "claimed"]);
  });

  it("is Not invited/Invited/Claimed/Confirmed for BUCS Play — four states, genuinely different from Hudl's", () => {
    expect(allowedItemStates("bucs_play")).toEqual(["pending", "invited", "claimed", "complete"]);
    expect(allowedItemStates("bucs_play")).not.toEqual(allowedItemStates("hudl_access"));
  });

  it("never offers waived for any item but Subscription paid", () => {
    for (const code of [
      SUBS_INVOICED_ITEM_CODE,
      KIT_DISTRIBUTED_ITEM_CODE,
      "photo",
      "comms_groups",
      "hudl_access",
      "bucs_play",
      "code_of_conduct",
      "photo_release",
    ]) {
      expect(allowedItemStates(code)).not.toContain("waived");
    }
  });

  it("never offers not_applicable anywhere — there is no escape hatch", () => {
    for (const code of [
      SUBS_INVOICED_ITEM_CODE,
      SUBS_PAID_ITEM_CODE,
      KIT_DISTRIBUTED_ITEM_CODE,
      "photo",
      "comms_groups",
      "hudl_access",
      "bucs_play",
      "code_of_conduct",
      "photo_release",
    ]) {
      expect(allowedItemStates(code)).not.toContain("not_applicable");
    }
  });

  it("offers nothing at all for a derived item — no dropdown, ever", () => {
    for (const code of ["contact_academic_details", "season_welcome_consent"]) {
      expect(isDerivedItem(code)).toBe(true);
    }
  });

  it("is not derived for any of the nine operator-ticked items", () => {
    for (const code of [
      SUBS_INVOICED_ITEM_CODE,
      SUBS_PAID_ITEM_CODE,
      KIT_DISTRIBUTED_ITEM_CODE,
      "photo",
      "comms_groups",
      "hudl_access",
      "bucs_play",
      "code_of_conduct",
      "photo_release",
    ]) {
      expect(isDerivedItem(code)).toBe(false);
    }
  });

  it("falls back to the plain pending/complete binary for a code outside the frozen checklist", () => {
    expect(allowedItemStates("not_a_real_item")).toEqual(["pending", "complete"]);
  });
});

describe("itemStateLabel — the word Brian actually said, per item", () => {
  it("is invoiced-or-not for Subscription invoiced, never Complete", () => {
    expect(itemStateLabel(SUBS_INVOICED_ITEM_CODE, "pending")).toBe("Not invoiced");
    expect(itemStateLabel(SUBS_INVOICED_ITEM_CODE, "complete")).toBe("Invoiced");
  });

  it("reads paid, waived, or not paid for Subscription paid — Brian's own three words", () => {
    expect(itemStateLabel(SUBS_PAID_ITEM_CODE, "pending")).toBe("Not paid");
    expect(itemStateLabel(SUBS_PAID_ITEM_CODE, "complete")).toBe("Paid");
    expect(itemStateLabel(SUBS_PAID_ITEM_CODE, "waived")).toBe("Waived");
  });

  it("is Yes/No for Kit Distributed, Squad photo, Code of Conduct and Photo release", () => {
    for (const code of [KIT_DISTRIBUTED_ITEM_CODE, "photo", "code_of_conduct", "photo_release"]) {
      expect(itemStateLabel(code, "pending")).toBe("No");
      expect(itemStateLabel(code, "complete")).toBe("Yes");
    }
  });

  it("reads not assigned, assigned and invited, in the group for Comms group", () => {
    expect(itemStateLabel("comms_groups", "pending")).toBe("Not assigned");
    expect(itemStateLabel("comms_groups", "invited")).toBe("Assigned and invited");
    expect(itemStateLabel("comms_groups", "complete")).toBe("In the group");
  });

  it("reads not invited, invited, claimed for Hudl access — no fourth word", () => {
    expect(itemStateLabel("hudl_access", "pending")).toBe("Not invited");
    expect(itemStateLabel("hudl_access", "invited")).toBe("Invited");
    expect(itemStateLabel("hudl_access", "claimed")).toBe("Claimed");
  });

  it("reads not invited, invited, claimed, confirmed for BUCS Play", () => {
    expect(itemStateLabel("bucs_play", "pending")).toBe("Not invited");
    expect(itemStateLabel("bucs_play", "invited")).toBe("Invited");
    expect(itemStateLabel("bucs_play", "claimed")).toBe("Claimed");
    expect(itemStateLabel("bucs_play", "complete")).toBe("Confirmed");
  });

  it("throws for a state this item's own list does not hold — the actual defect, made structurally impossible", () => {
    // Exactly what Brian saw: BUCS Play offering "Waived" and "Not
    // applicable", and Hudl access reaching "Confirmed" it should never
    // hold. This is the regression test the correction brief asks for by
    // name — it fails if a shared escape hatch or a resolution vocabulary
    // is ever painted back over an item's own list.
    expect(() => itemStateLabel("bucs_play", "waived")).toThrow(
      /is not a state "bucs_play" can occupy/,
    );
    expect(() => itemStateLabel("bucs_play", "not_applicable")).toThrow();
    expect(() => itemStateLabel("hudl_access", "complete")).toThrow();
    expect(() => itemStateLabel(SUBS_INVOICED_ITEM_CODE, "invited")).toThrow();
    expect(() => itemStateLabel(SUBS_INVOICED_ITEM_CODE, "waived")).toThrow();
    expect(() => itemStateLabel(KIT_DISTRIBUTED_ITEM_CODE, "waived")).toThrow();
  });
});
