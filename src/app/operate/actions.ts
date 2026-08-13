"use server";

import { requireCapability } from "@/lib/auth/guards";
import { notImplemented } from "./not-implemented";

/**
 * The slice's privileged server actions, and the authorization that will still
 * be there when somebody fills them in.
 *
 * ## Why these exist now, empty
 *
 * LAN-73's acceptance criteria: "`requireRole` is enforced in the server action
 * itself, not only in the page — proven by a test that calls the action
 * directly with an under-privileged actor". That is not a property a page can
 * have on the action's behalf, and it is not a property that can be added later
 * without re-auditing every screen. So each privileged action in the slice gets
 * its entry point here, with the guard already in it, and the issue that owns
 * the behaviour fills in the body.
 *
 * Each one calls `requireCapability()` **first**, and each therefore:
 *
 *   * resolves the actor from the verified session, never from an argument. A
 *     server action is a POST endpoint the browser can call directly; an action
 *     that accepted "who am I" would accept whatever was sent;
 *   * reads the permitted role codes from `src/lib/auth/capabilities.ts`, so no
 *     action carries a policy of its own and changing access means changing one
 *     file;
 *   * refuses with `NotPermitted`, whose message names what the action requires
 *     and never what the caller holds.
 *
 * Deleting the guard from a page cannot grant any of them. Deleting it from
 * here is the change a reviewer must catch, which is why every one of these has
 * a test that calls it directly with an under-privileged actor.
 *
 * ## What they do not do
 *
 * Nothing. No read, no write, no audit row. Past the guard each raises
 * `ActionNotImplemented`, which is not a `ServiceError` and is not a refusal —
 * so a test can tell "authorized, and unbuilt" apart from "refused", which is
 * exactly the distinction that proves the guard ran and passed.
 */

/** Activate a season membership. Exec/GM only. Behaviour: LAN-75. */
export async function activateMembership(): Promise<never> {
  await requireCapability("membership_activation");
  notImplemented("LAN-75", "activate a season membership");
}

/**
 * Approve an event and release its invitations. The four calendar roles.
 *
 * The behaviour shipped in LAN-77 and lives in
 * `src/app/operate/events/actions.ts`, beside the screen that posts to it —
 * same as `activateMembership` above, whose body shipped in LAN-75. These
 * entry points stay because they are the guard-parity harness LAN-73 built:
 * `actions.test.ts` calls each one directly with an under-privileged actor, so
 * a capability quietly widened or a guard quietly deleted fails a test here
 * rather than being discovered on a screen.
 */
export async function approveEvent(): Promise<never> {
  await requireCapability("event_approval");
  notImplemented("LAN-77", "approve an event and release its invitations");
}

/** Record attendance for an occurred event. HC/OC/DC only. Behaviour: LAN-80/LAN-110. */
export async function recordAttendance(): Promise<never> {
  await requireCapability("attendance_recorder");
  notImplemented("LAN-80", "record attendance for an occurred event");
}

/** Manage operator accounts and role assignments. Nobody, pending an owner decision. */
export async function manageRoles(): Promise<never> {
  await requireCapability("role_management");
  notImplemented("none yet", "manage operator accounts and role assignments");
}

/** Administer WhatsApp delivery. Nobody, pending LAN-92 and LAN-78. */
export async function administerDelivery(): Promise<never> {
  await requireCapability("delivery_administration");
  notImplemented("LAN-78", "administer WhatsApp delivery, retries and revocation");
}

/** Read the Monday exception and action report. Nobody, pending LAN-81. */
export async function readLeadershipReport(): Promise<never> {
  await requireCapability("leadership_report");
  notImplemented("LAN-81", "read the Monday exception and action report");
}
