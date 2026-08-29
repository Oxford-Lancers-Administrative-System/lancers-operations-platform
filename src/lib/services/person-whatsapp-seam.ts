/**
 * The WhatsApp seam — LAN-185, `REQ-whatsapp-seam`.
 *
 * Pure. No database, no `server-only`: the decision has to be checkable from a
 * test with an arbitrary answer, exactly the posture `person-validation.ts`
 * states for the same reason.
 *
 * ## The substrate this seam has no answer for
 *
 * `docs/architecture/data-model.md`'s "Deliberately not implemented" section
 * names **Channel Presence** and **Group Membership** — "on WhatsApp and in
 * this season's group" — as frozen-model concepts release one omits entirely.
 * `W2-correct-a-persons-record.md`'s own words: "On WhatsApp has no substrate
 * on `main`, so there is no flag to set and no state to write." Nothing this
 * package is permitted to build (no migration; `REQ-whatsapp-seam` is explicit
 * that "Mission 6 verifies") can honestly answer "was this number on WhatsApp
 * for the active season" — because no fact stored anywhere says so.
 *
 * `REQ-whatsapp-seam` still requires the **check point** to exist: "the
 * correction surface says so before the save" when the answer is yes, and
 * "never claims the new number is or is not on WhatsApp" either way. This
 * module is that check point, built and proven for both branches, wired at its
 * one call site (`supersedeContactPoint`'s mobile-kind path) with the only
 * answer that is honest today: `false`, because nothing on `main` can support
 * `true` without inventing a fact this package has no authority to invent. The
 * day Mission 6 builds the real substrate, its answer threads straight through
 * this same seam — the mechanism, the copy, and the audit write are already
 * here and already correct; only the caller's input changes.
 */

export interface WhatsappSeamConsequence {
  /** Whether the correction surface shows the warning before the save. */
  readonly warn: boolean;
  /**
   * The sentence `W2-05` draws, naming the number being replaced and the
   * season, or `null` when there is nothing to say. Never claims anything
   * about the *new* number — `REQ-whatsapp-seam`, verbatim.
   */
  readonly message: string | null;
}

/**
 * `W2-05`'s exact consequence, for the number being replaced.
 *
 * `wasOnWhatsappForActiveSeason` is the one fact this function does not
 * itself determine — see the module note. `null` and `false` both render no
 * warning; the distinction (never recorded, versus recorded and no) belongs
 * to whatever substrate one day answers this, not to this seam.
 */
export function describeWhatsappSeamConsequence(
  previousRawValue: string,
  seasonLabel: string,
  wasOnWhatsappForActiveSeason: boolean | null,
): WhatsappSeamConsequence {
  if (!wasOnWhatsappForActiveSeason) {
    return { warn: false, message: null };
  }
  return {
    warn: true,
    message:
      `${previousRawValue} is on WhatsApp for ${seasonLabel}. Changing the number ends that. ` +
      `A rejoin will be asked for on the new number, and the person is not reachable on ` +
      `WhatsApp until then.`,
  };
}
