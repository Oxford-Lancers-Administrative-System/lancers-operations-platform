import { describe, expect, it } from "vitest";
import {
  allowedItemResolutions,
  allowedItemStatuses,
  itemResolutionLabel,
  itemStatusLabel,
  KIT_DISTRIBUTED_ITEM_CODE,
  SUBS_INVOICED_ITEM_CODE,
  SUBS_PAID_ITEM_CODE,
} from "./onboarding-item-shapes";

/**
 * D-002 (correction round 3, Q-14, Brian, 2026-09-04): "A cell can never
 * display a status its own control does not offer." These prove the model
 * every write path and every rendering surface reads from — see
 * `membership.ts`'s `resolveOnboardingItem`, `board-columns.ts` and
 * `record-view.tsx`.
 */
describe("allowedItemStatuses — the eleven-item checklist, Q-14 settled", () => {
  it("is binary for the operator-ticked-only items — no invited, no claimed", () => {
    for (const code of ["subs_invoiced", "subs_paid", "photo"]) {
      expect(allowedItemStatuses(code)).toEqual([
        "pending",
        "complete",
        "waived",
        "not_applicable",
      ]);
    }
  });

  it("excludes waived and not_applicable for Kit Distributed alone — B-001, reconfirmed", () => {
    expect(allowedItemStatuses(KIT_DISTRIBUTED_ITEM_CODE)).toEqual(["pending", "complete"]);
  });

  it("carries invited and claimed for the two trust-class items — BUCS Play, Hudl access", () => {
    for (const code of ["bucs_play", "hudl_access"]) {
      expect(allowedItemStatuses(code)).toEqual([
        "pending",
        "invited",
        "claimed",
        "complete",
        "waived",
        "not_applicable",
      ]);
    }
  });

  it("carries invited but never claimed for Comms group — operator ×2, no player action", () => {
    expect(allowedItemStatuses("comms_groups")).toEqual([
      "pending",
      "invited",
      "complete",
      "waived",
      "not_applicable",
    ]);
  });

  it("is binary, with the waiver escape hatch, for the player-signed and derived items", () => {
    for (const code of [
      "code_of_conduct",
      "photo_release",
      "contact_academic_details",
      "season_welcome_consent",
    ]) {
      expect(allowedItemStatuses(code)).toEqual([
        "pending",
        "complete",
        "waived",
        "not_applicable",
      ]);
    }
  });

  it("falls back to the plain pending/complete binary, plus the waiver escape hatch, for a code outside the frozen checklist", () => {
    expect(allowedItemStatuses("not_a_real_item")).toEqual([
      "pending",
      "complete",
      "waived",
      "not_applicable",
    ]);
  });
});

describe("allowedItemResolutions — the operator's own dropdown, per item", () => {
  it("offers the full four resolutions to every item except Kit Distributed", () => {
    for (const code of [
      "subs_invoiced",
      "subs_paid",
      "bucs_play",
      "hudl_access",
      "photo",
      "comms_groups",
      "code_of_conduct",
      "photo_release",
      "contact_academic_details",
      "season_welcome_consent",
    ]) {
      expect(allowedItemResolutions(code)).toEqual([
        "complete",
        "waived",
        "not_applicable",
        "reopen",
      ]);
    }
  });

  it("offers only complete and reopen for Kit Distributed — B-001's binary reduction", () => {
    expect(allowedItemResolutions(KIT_DISTRIBUTED_ITEM_CODE)).toEqual(["complete", "reopen"]);
  });
});

/**
 * D-002 (correction round 4, `WP-operator-record`, LAN-217): the actual
 * defect Brian's second walkthrough named — a cell rendering "Complete" for
 * an item that is invoiced-or-not, and "Invited" for an item whose own
 * control never offers it. `itemStatusLabel` is the one place both the board
 * and the record page now read a status's word from, so this proves the
 * words themselves, not only the set they are drawn from.
 */
describe("itemStatusLabel — the word Brian actually said, per item", () => {
  it("is invoiced-or-not for Subscription invoiced, never Complete", () => {
    expect(itemStatusLabel(SUBS_INVOICED_ITEM_CODE, "pending")).toBe("Not invoiced");
    expect(itemStatusLabel(SUBS_INVOICED_ITEM_CODE, "complete")).toBe("Invoiced");
  });

  it("reads paid, waived, or not paid for Subscription paid — Brian's own three words", () => {
    expect(itemStatusLabel(SUBS_PAID_ITEM_CODE, "pending")).toBe("Not paid");
    expect(itemStatusLabel(SUBS_PAID_ITEM_CODE, "complete")).toBe("Paid");
    expect(itemStatusLabel(SUBS_PAID_ITEM_CODE, "waived")).toBe("Waived");
  });

  it("is Yes/No for Kit Distributed and Squad photo — both a plain yes-or-no question", () => {
    for (const code of [KIT_DISTRIBUTED_ITEM_CODE, "photo"]) {
      expect(itemStatusLabel(code, "pending")).toBe("No");
      expect(itemStatusLabel(code, "complete")).toBe("Yes");
    }
  });

  it("reads not assigned, assigned and invited, in the group for Comms group", () => {
    expect(itemStatusLabel("comms_groups", "pending")).toBe("Not assigned");
    expect(itemStatusLabel("comms_groups", "invited")).toBe("Assigned and invited");
    expect(itemStatusLabel("comms_groups", "complete")).toBe("In the group");
  });

  it("reads invited, claimed, confirmed for BUCS Play and Hudl access", () => {
    for (const code of ["bucs_play", "hudl_access"]) {
      expect(itemStatusLabel(code, "invited")).toBe("Invited");
      expect(itemStatusLabel(code, "claimed")).toBe("Claimed");
      expect(itemStatusLabel(code, "complete")).toBe("Confirmed");
    }
  });

  it("reads signed or not for Code of Conduct and Photo release", () => {
    for (const code of ["code_of_conduct", "photo_release"]) {
      expect(itemStatusLabel(code, "pending")).toBe("Not signed");
      expect(itemStatusLabel(code, "complete")).toBe("Signed");
    }
  });

  it("shares the plain escape-hatch words on every item that carries them", () => {
    for (const code of ["subs_invoiced", "photo", "bucs_play", "code_of_conduct"]) {
      expect(itemStatusLabel(code, "waived")).toBe("Waived");
      expect(itemStatusLabel(code, "not_applicable")).toBe("Not applicable");
    }
  });

  it("throws for a status this item's own model says it cannot occupy — the actual defect, made impossible", () => {
    // Exactly what Brian saw: "Invited" rendered for an item that can never
    // reach it. This is the regression test the brief asks for by name — it
    // fails if a hardcoded label map ever again offers a word this item's
    // control does not.
    expect(() => itemStatusLabel(SUBS_INVOICED_ITEM_CODE, "invited")).toThrow(
      /is not a status "subs_invoiced" can occupy/,
    );
    expect(() => itemStatusLabel(KIT_DISTRIBUTED_ITEM_CODE, "waived")).toThrow();
  });
});

describe("itemResolutionLabel — the open dropdown's own words, reopen included", () => {
  it("reads Reopen for every item except Kit Distributed", () => {
    expect(itemResolutionLabel(SUBS_INVOICED_ITEM_CODE, "reopen")).toBe("Reopen");
    expect(itemResolutionLabel("bucs_play", "reopen")).toBe("Reopen");
  });

  it("reads Kit Distributed's own reopen as No, never Reopen — B-001's binary control has no room for a third word", () => {
    expect(itemResolutionLabel(KIT_DISTRIBUTED_ITEM_CODE, "reopen")).toBe("No");
  });

  it("delegates every non-reopen resolution to itemStatusLabel, so the two never drift apart", () => {
    expect(itemResolutionLabel(SUBS_INVOICED_ITEM_CODE, "complete")).toBe("Invoiced");
    expect(itemResolutionLabel("bucs_play", "complete")).toBe("Confirmed");
  });

  it("throws for a resolution this item's own control does not offer", () => {
    // Kit Distributed's dropdown is `complete`/`reopen` only (B-001) — asking
    // for its `waived` word is exactly the class of bug this function exists
    // to make impossible, one level up from the status it would eventually
    // have produced.
    expect(() => itemResolutionLabel(KIT_DISTRIBUTED_ITEM_CODE, "waived")).toThrow();
  });
});
