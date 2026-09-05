import { describe, expect, it } from "vitest";
import {
  allowedItemResolutions,
  allowedItemStatuses,
  KIT_DISTRIBUTED_ITEM_CODE,
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
