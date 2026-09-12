export const PERSON_ALREADY_HAS_LOGIN_RULE = "operator_account_already_exists";
export const EMAIL_ALREADY_HAS_LOGIN_RULE = "operator_login_email_taken";
export const ROLE_REQUIRED_RULE = "operator_invitation_role_required";
export const UNKNOWN_ROLE_RULE = "operator_invitation_role_unknown";
export const INVALID_EMAIL_RULE = "operator_invitation_email_invalid";
export const NAME_REQUIRED_RULE = "operator_invitation_name_required";
export const BACKDATING_REASON_RULE = "operator_invitation_backdating_reason_required";
export const NOT_RESENDABLE_RULE = "operator_invitation_not_resendable";
/** LAN-332: the invite form takes a phone number, so it obeys the club's one phone rule like every other form. */
export const INVALID_PHONE_RULE = "operator_invitation_phone_invalid";
