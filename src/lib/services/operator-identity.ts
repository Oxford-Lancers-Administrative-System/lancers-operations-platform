import "server-only";

import { NotPermitted, UnexpectedDatabaseError } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

// The Supabase Auth half of operator invitation — LAN-131, `REQ-email-invitation-path`, `DEC-email-authentication`. A port with one implementation; no SQL against `auth`, ever (ADR 0026).

export interface OperatorIdentityPort {
  createLogin(email: string): Promise<{ authUserId: string }>;
  sendInvitation(email: string, redirectTo: string): Promise<void>;
  changeLoginEmail(authUserId: string, email: string): Promise<void>;
  /** Compensation only — never a way to remove an operator. */
  deleteLogin(authUserId: string): Promise<void>;
}

/**
 * LAN-311. The backstop behind `refuseTakenEmail`, and the one that catches an
 * address the Auth server knows and this application's `operator_accounts` does
 * not — a login left behind by an invitation whose rows failed to write, say.
 * It names no record to open, because in this case there is not one: the
 * address the Auth server holds belongs to nobody the club has on its books,
 * and clearing it is not something the invite form can do. `refuseTakenEmail`
 * is the other half, and only it can name whose account an address is.
 *
 * It fires **before** anything is written or sent, which is the point: an
 * `invite` token cannot verify against an address that already has an account,
 * so an invitation minted here would be dead on arrival and its holder would
 * land on `/invitation-link` with nothing to do. Refusing costs the
 * administrator one sentence; sending cost Clint a tester week's item 8.
 */
const DUPLICATE_LOGIN_MESSAGE =
  "That email address already has a sign-in account, and the club's records hold no operator " +
  "for it. An invitation sent to it could never be used, and nothing on this screen can " +
  "change that. Invite a different address.";

const DUPLICATE_LOGIN_RULE = "operator_login_email_taken";

export function supabaseOperatorIdentity(): OperatorIdentityPort {
  return {
    async createLogin(email: string) {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        // GoTrue's invite endpoint refuses a confirmed address.
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
        // Recorded as the reason rather than raised as a refusal — see decision history.
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
        email_confirm: false,
      });

      if (error) {
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

export class InvitationDeliveryFailure extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvitationDeliveryFailure";
  }
}

function isDuplicateAddress(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "email_exists" || code === "user_already_exists") return true;

  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /already (been )?registered|already exists/i.test(message);
}
