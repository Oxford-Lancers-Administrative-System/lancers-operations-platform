import "server-only";

import { NotPermitted, UnexpectedDatabaseError } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The Supabase Auth half of operator invitation — LAN-131,
 * `REQ-email-invitation-path` and `DEC-email-authentication`.
 *
 * ## Why this is a port with one implementation
 *
 * Everything else in the invitation flow is rows in a transaction. These four
 * operations are not: they are network calls to the Auth server, they are not
 * transactional, and they cannot be rolled back. Separating them out is what
 * lets `./operator-invitations.ts` be read as "what is written, in what order,
 * and what is undone if the write fails" — with the untransactional part named
 * at each point rather than mixed in.
 *
 * The interface also lets a test pose a delivery failure. That matters more
 * than usual here: `REQ-invitation-states` requires that "delivery failure
 * preserves the same Person and operator account and never creates a
 * duplicate", and the only honest way to prove that is to make the send fail
 * and then count the rows.
 *
 * ## No SQL against the `auth` schema, ever
 *
 * `REQ-one-time-bootstrap` is explicit that provisioning uses "the Supabase
 * administrative API rather than direct SQL insertion into Auth-owned tables",
 * and the same rule holds for ordinary invitation. It is not merely a
 * preference: GoTrue owns the shape of `auth.users`, the hosted runtime
 * connects as `app_runtime` — a least-privilege login with `service_role`'s
 * grants and no reach into the `auth` schema at all (ADR 0026) — and a password
 * or identity row written by hand is a support incident nobody can debug.
 *
 * ## Creating and sending are two calls, deliberately
 *
 * `inviteUserByEmail` creates the login *and* sends the email in one request,
 * which reads as the obvious choice and gets the failure ordering wrong. If it
 * is the first thing the flow does, a database failure afterwards leaves an
 * `auth.users` row nothing points at; if the mail transport is down it fails
 * whole, and no account exists for the Delivery failed state to be *about*.
 *
 * So the flow creates the login first with {@link createLogin}, which sends
 * nothing, writes every row it is going to write, and only then calls
 * {@link sendInvitation}. A delivery failure therefore happens with the Person,
 * the operator account and the role assignment already committed — which is
 * exactly what the requirement asks be preserved.
 *
 * `sendInvitation` is GoTrue's invite endpoint, which re-sends for a login that
 * exists and has never confirmed an email. That is also what makes resend and
 * correction work: one call covers first send, resend and send-after-correction,
 * and it refuses by itself once the holder has established credentials, because
 * then the login is confirmed and there is nothing to invite them to.
 */

/** What the invitation flow needs from Supabase Auth, and nothing else. */
export interface OperatorIdentityPort {
  /**
   * Creates an unconfirmed, passwordless login for this address and returns its
   * `auth.users.id`. **Sends no email.**
   *
   * Refuses when the address already has a login. That refusal is the Auth
   * server's own uniqueness rule, and it is the second guard behind
   * `operator_accounts_login_email_key`; the flow checks its own table first so
   * that the ordinary duplicate is refused in the club's words before anything
   * is created.
   */
  createLogin(email: string): Promise<{ authUserId: string }>;

  /**
   * Sends — or re-sends — the first-access invitation to this address, with
   * `redirectTo` as the exact destination the emailed link carries.
   *
   * Throws on any failure. The caller records the failure as a delivery
   * failure against the account that already exists.
   */
  sendInvitation(email: string, redirectTo: string): Promise<void>;

  /** Moves a login to a different address. Sends nothing. */
  changeLoginEmail(authUserId: string, email: string): Promise<void>;

  /**
   * Removes a login. **Compensation only**, for a login this flow created
   * moments ago and whose database rows then failed to commit.
   *
   * Never a way to remove an operator: `REQ-deactivate-and-reinstate` is
   * unambiguous that "no action deletes Person, membership, binding,
   * attribution or history", and revocation is `is_active = false` on a row
   * `service_role` holds no `delete` on.
   */
  deleteLogin(authUserId: string): Promise<void>;
}

/** The message an administrator sees when the address already has a login. */
export const DUPLICATE_LOGIN_MESSAGE =
  "That email address already has an operator login. One person has one login, so if this is " +
  "the same person, open their operator record instead of inviting them again — and if it is " +
  "somebody else, invite them with their own address.";

export const DUPLICATE_LOGIN_RULE = "operator_login_email_taken";

/**
 * The real implementation, over the privileged Supabase client.
 *
 * Constructed per call rather than held in a module-level constant so that
 * importing this module — which `tsc` and the Next.js build both do — never
 * reads a secret from the environment.
 */
export function supabaseOperatorIdentity(): OperatorIdentityPort {
  return {
    async createLogin(email: string) {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        // Unconfirmed on purpose. Confirmation is what the invitation link
        // does, and a login created already confirmed could not be invited:
        // GoTrue's invite endpoint refuses a confirmed address, which is the
        // same rule that correctly stops an active operator being re-invited.
        email_confirm: false,
      });

      if (error || !data?.user?.id) {
        if (isDuplicateAddress(error)) {
          throw new NotPermitted(DUPLICATE_LOGIN_MESSAGE, { rule: DUPLICATE_LOGIN_RULE });
        }
        throw new UnexpectedDatabaseError(
          "The operator login could not be created. Nothing was saved; try again.",
          { rule: "operator_login_not_created" },
        );
      }

      return { authUserId: data.user.id };
    },

    async sendInvitation(email: string, redirectTo: string) {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) {
        // One failure is worth naming, because otherwise it arrives as
        // "already registered" against an account the club can see is still
        // Invitation pending, which reads as a contradiction.
        //
        // GoTrue's invite endpoint re-sends for a login that has never
        // confirmed an address, and refuses once it has. Following the emailed
        // link is what confirms it — so somebody who opened their invitation
        // and then closed the tab without choosing a password is confirmed,
        // has no password, and cannot be re-invited. It is not a dead end and
        // it does not need an administrator: the sign-in page's forgotten-
        // password flow reaches them, and setting a password there activates
        // the account exactly as the invitation would have.
        //
        // Stored as the recorded reason rather than raised as a refusal,
        // because the account is genuinely undelivered-to and the state is
        // genuinely Delivery failed; what changes is that the sentence says
        // what to do.
        throw new InvitationDeliveryFailure(
          isDuplicateAddress(error)
            ? "The invitation link for this address has already been opened, so a new one " +
                "cannot be sent to it. Ask them to use “Forgot password?” on the " +
                "sign-in page to choose their password — that finishes setting up the " +
                "account — or correct the invitation to a different address."
            : // Otherwise the transport's own words, which are the only thing
              // that distinguishes a wrong address from a mail server that was
              // down. Carried, not shown: the surfaces render the state's
              // sentence.
              error.message,
        );
      }
    },

    async changeLoginEmail(authUserId: string, email: string) {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        // Again unconfirmed: the corrected address has not proved anything yet,
        // and the invitation that follows is what proves it.
        email_confirm: false,
      });

      if (error) {
        // **`isDuplicateAddress` is deliberately not consulted here**, and that
        // is a measurement rather than an oversight. GoTrue answers the two
        // admin endpoints quite differently for the same collision, against
        // this repository's own local stack:
        //
        //   createUser      → 422, code `email_exists`,
        //                     "A user with this email address has already been
        //                      registered"
        //   updateUserById  → 500, code `undefined`,
        //                     "Error updating user"
        //
        // The second carries nothing that distinguishes a taken address from a
        // database being down, and "Error updating user" is what it says for
        // *every* failed update. Matching on it would tell an administrator
        // that an address is already in use whenever anything at all went
        // wrong, which is worse than saying less: a wrong actionable message
        // sends somebody to change a field that was never the problem.
        //
        // So the sentence names both reachable causes without asserting
        // either. It is reachable only in the race the service's own
        // `login_email` pre-check cannot close — an address held by an
        // `auth.users` row that no `operator_accounts` row points at — and by
        // then nothing has been written and there is nothing to undo.
        throw new UnexpectedDatabaseError(
          "The invitation address could not be changed, and nothing was saved. If that " +
            "address already belongs to another operator login, use a different one; " +
            "otherwise try again.",
          { rule: "operator_login_email_not_changed" },
        );
      }
    },

    async deleteLogin(authUserId: string) {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) {
        throw new UnexpectedDatabaseError("The operator login could not be removed.", {
          rule: "operator_login_not_removed",
        });
      }
    },
  };
}

/**
 * A delivery failure, distinguished from every other error the flow can hit.
 *
 * It is deliberately **not** a `ServiceError`: a delivery failure is not a
 * refusal and not a broken write, it is a recorded outcome that leaves the
 * account exactly where it was and offers a resend. The flow catches this type
 * by name and records `administration.operator.invitation_delivery_failed`;
 * anything else propagates.
 */
export class InvitationDeliveryFailure extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvitationDeliveryFailure";
  }
}

/**
 * Is this the Auth server saying the address is taken?
 *
 * Used by `createLogin` and by `sendInvitation`, and **not** by
 * `changeLoginEmail` — see the note there. GoTrue answers `createUser` with a
 * 422 and `code: "email_exists"`, which is exactly what this reads; it answers
 * `updateUserById` with a bare 500 that says nothing, so there is nothing here
 * for it to match and pretending otherwise would produce a confident wrong
 * message.
 */
function isDuplicateAddress(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "email_exists" || code === "user_already_exists") return true;

  // Older GoTrue builds answer 422 with prose and no code. Matched loosely and
  // only as a fallback: the consequence of missing it is an unexpected-error
  // message instead of the club's sentence, never a duplicate account, because
  // the address is unique in `auth.users` regardless.
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /already (been )?registered|already exists/i.test(message);
}
