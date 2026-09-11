/**
 * The rule codes this module's refusals carry, that a caller matches on.
 * LAN-131. The words behind each are in `./shared.ts`, alongside every
 * refusal this module has that a caller does not need to distinguish by code.
 */

export const PERSON_ALREADY_HAS_LOGIN_RULE = "operator_account_already_exists";
export const EMAIL_ALREADY_HAS_LOGIN_RULE = "operator_login_email_taken";
export const ROLE_REQUIRED_RULE = "operator_invitation_role_required";
export const UNKNOWN_ROLE_RULE = "operator_invitation_role_unknown";
export const INVALID_EMAIL_RULE = "operator_invitation_email_invalid";
export const NAME_REQUIRED_RULE = "operator_invitation_name_required";
export const BACKDATING_REASON_RULE = "operator_invitation_backdating_reason_required";
export const NOT_RESENDABLE_RULE = "operator_invitation_not_resendable";
