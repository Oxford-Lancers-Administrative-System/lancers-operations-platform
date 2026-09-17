import "server-only";

import type { Tx } from "@/lib/db";
import { ERASED_DISPLAY_NAME, ERASED_TEXT } from "./shared";

/**
 * The anonymisation itself — LAN-361.
 *
 * Every table is named here, explicitly, and every one is either *deleted*
 * (it is nothing but the person's own contact details), *scrubbed* (it is a
 * record of something that happened, carrying free text that could name them)
 * or *left alone* (it is a count, a date or a foreign key, and nothing in it
 * identifies anybody).
 *
 * The list came from the catalogue rather than from reading the migrations:
 * `pg_constraint` has sixty-two foreign keys to `people (id)`, and a list
 * assembled by eye would have missed some of them. `tests/person-erasure.test.ts`
 * closes the loop from the other end — it scans every text and JSON column of
 * every table for the seeded person's own values and fails if any survives —
 * so a table added later that carries a name fails a test rather than quietly
 * keeping it.
 */

interface ErasureCounts {
  /** Rows removed outright — the person's own contact details and nothing else. */
  readonly deleted: Readonly<Record<string, number>>;
  /** Rows kept, with the free text in them replaced. */
  readonly scrubbed: Readonly<Record<string, number>>;
  /** Live links withdrawn and queued messages cancelled. */
  readonly tokensRevoked: number;
  readonly jobsCancelled: number;
}

async function run(tx: Tx, sql: string, params: unknown[]): Promise<number> {
  const result = await tx.query(sql, params);
  return result.rowCount ?? 0;
}

export async function anonymisePersonIn(tx: Tx, personId: string): Promise<ErasureCounts> {
  const deleted: Record<string, number> = {};
  const scrubbed: Record<string, number> = {};

  // -------------------------------------------------------------------------
  // Deleted outright: these rows are the person's contact details and nothing
  // else, so there is nothing in them worth keeping once they are not them.
  // -------------------------------------------------------------------------

  deleted.contact_points = await run(
    tx,
    `delete from public.contact_points where person_id = $1::uuid`,
    [personId],
  );
  deleted.person_aliases = await run(
    tx,
    `delete from public.person_aliases where person_id = $1::uuid`,
    [personId],
  );
  // Third-party personal data about somebody who never agreed to be in this
  // system at all (REQ-restricted-fields). It goes first and completely.
  deleted.person_emergency_contacts = await run(
    tx,
    `delete from public.person_emergency_contacts where person_id = $1::uuid`,
    [personId],
  );

  // -------------------------------------------------------------------------
  // Every live link withdrawn, every queued message cancelled.
  // -------------------------------------------------------------------------

  const personTokens = await run(
    tx,
    `update public.person_access_tokens
        set revoked_at = now(), revoked_reason = $2
      where person_id = $1::uuid and revoked_at is null`,
    [personId, ERASED_TEXT],
  );
  const rsvpTokens = await run(
    tx,
    `update public.rsvp_access_tokens
        set revoked_at = now(), revoked_reason = $2
      where revoked_at is null
        and invitation_id in (select id from public.invitations where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  const jobsCancelled = await run(
    tx,
    `update public.notification_jobs
        set status = 'cancelled', cancelled_reason = $2, updated_at = now()
      where person_id = $1::uuid
        and status in ('pending', 'ready', 'processing')`,
    [personId, ERASED_TEXT],
  );

  // -------------------------------------------------------------------------
  // LAN-394. The messaging safety machinery's two identifying fields, and any
  // hold that was recorded against this person or one of their destinations.
  //
  // Order matters: the destination scopes can only be found *through* the
  // attempts, so they go first and the fields are cleared after. The attempt
  // rows themselves stay, with their outcome, provider reference and failure
  // reason intact — an erasure anonymises a person, it does not delete the
  // club's record of what it did. `safety_admitted_at` stays for the same
  // reason: the global accounting is about volume, not about anybody.
  // -------------------------------------------------------------------------

  deleted.messaging_safety_scopes = await run(
    tx,
    `delete from public.messaging_safety_scopes
      where (scope_kind = 'person' and scope_key = $1::text)
         or (scope_kind = 'destination'
             and scope_key in (
               select a.safety_destination_key
                 from public.delivery_attempts a
                where a.safety_person_id = $1::uuid
                  and a.safety_destination_key is not null))`,
    [personId],
  );

  scrubbed.delivery_attempts_safety = await run(
    tx,
    `update public.delivery_attempts
        set safety_person_id = null, safety_destination_key = null
      where safety_person_id = $1::uuid`,
    [personId],
  );

  // -------------------------------------------------------------------------
  // Scrubbed: the record of what happened stays, the words that named them go.
  // -------------------------------------------------------------------------

  // Every job, not only the cancelled ones: `template_variables` is the
  // rendered message's own substitutions, and the first of them is their name.
  scrubbed.notification_jobs = await run(
    tx,
    `update public.notification_jobs
        set template_variables = '{}'::jsonb,
            last_error = case when last_error is null then null else $2 end,
            held_reason = case when held_reason is null then null else $2 end
      where person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );

  // What the provider said back. `detail` carries the destination number on a
  // failure, and the message id is the provider's handle on their phone.
  scrubbed.delivery_results = await run(
    tx,
    `update public.delivery_results
        set detail = case when detail is null then null else $2 end,
            provider_message_id = case when provider_message_id is null then null else $2 end
      where notification_job_id in (
        select id from public.notification_jobs where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  // The provider's own message id is unique across attempts, so it cannot be
  // replaced by one fixed string — and it cannot simply be nulled either.
  //
  // Nulling it was what this did, and it made erasing anybody the club had
  // actually reached fail outright: `delivery_attempts_acceptance_names_its_message`
  // requires an accepted attempt to name the message the provider accepted,
  // and every delivered message has both. Found by LAN-394's own erasure test,
  // which was the first to erase a person with an accepted attempt behind them.
  //
  // So it is replaced by a value derived from the row's own id: unique by
  // construction, carries no provider reference, and leaves the fact that the
  // provider accepted something exactly as true as it was.
  scrubbed.delivery_attempts = await run(
    tx,
    `update public.delivery_attempts
        set failure_reason = case when failure_reason is null then null else $2 end,
            provider_message_id =
              case when provider_message_id is null then null else 'erased:' || id::text end
      where notification_job_id in (
        select id from public.notification_jobs where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );

  // The consent form they filled in. The agreement itself — which version, on
  // what day — is the record and stays; what they typed on the form is them.
  scrubbed.onboarding_agreements = await run(
    tx,
    `update public.onboarding_agreements
        set printed_name = null, form_name = null, form_address = null,
            form_postcode = null, form_tel = null, form_email = null
      where person_id = $1::uuid`,
    [personId],
  );

  // A deactivated operator account keeps its shape and loses its login.
  scrubbed.operator_accounts = await run(
    tx,
    `update public.operator_accounts
        set login_email = null,
            disabled_reason = case when disabled_reason is null then null else $2 end,
            invitation_delivery_failure_reason =
              case when invitation_delivery_failure_reason is null then null else $2 end
      where person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );

  // What the club recorded about them in words, on their own records — and,
  // separately, any dispute this person raised or resolved about somebody
  // else's record, where the free text is their own note rather than the
  // other person's disputed value.
  scrubbed.person_fact_disputes = await run(
    tx,
    `update public.person_fact_disputes
        set club_value = case when person_id = $1::uuid then $2 else club_value end,
            player_value = case when person_id = $1::uuid then $2 else player_value end,
            resolution_note = case when resolution_note is null then null else $2 end
      where person_id = $1::uuid
         or raised_by_person_id = $1::uuid
         or resolved_by_person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );
  scrubbed.season_memberships = await run(
    tx,
    `update public.season_memberships
        set departure_reason = case when departure_reason is null then null else $2 end,
            inactivity_label = case when inactivity_label is null then null else $2 end
      where person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );
  scrubbed.season_messaging_consents = await run(
    tx,
    `update public.season_messaging_consents
        set reason = case when reason is null then null else $2 end
      where person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );
  scrubbed.season_membership_status_events = await run(
    tx,
    `update public.season_membership_status_events
        set actor_label = case when actor_label is null then null else $2 end,
            reason = case when reason is null then null else $2 end
      where actor_person_id = $1::uuid
         or season_membership_id in (
           select id from public.season_memberships where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.onboarding_items = await run(
    tx,
    `update public.onboarding_items
        set waived_reason = case when waived_reason is null then null else $2 end
      where waived_by_person_id = $1::uuid
         or season_membership_id in (
              select id from public.season_memberships where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.onboarding_item_history = await run(
    tx,
    `update public.onboarding_item_history
        set reason = case when reason is null then null else $2 end
      where actor_person_id = $1::uuid
         or season_membership_id in (
           select id from public.season_memberships where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.onboarding_activity_log = await run(
    tx,
    `update public.onboarding_activity_log
        set actor_label = case when actor_label is null then null else $2 end
      where actor_person_id = $1::uuid
         or season_membership_id in (
           select id from public.season_memberships where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.eligibility_records = await run(
    tx,
    `update public.eligibility_records
        set evidence_reference = case when evidence_reference is null then null else $2 end
      where season_membership_id in (
        select id from public.season_memberships where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );

  // What they answered, and why they said no. The counts stay; the words go —
  // and the same for an operator who recorded somebody else's RSVP by hand.
  scrubbed.rsvp_responses = await run(
    tx,
    `update public.rsvp_responses
        set reason = case when reason is null then null else $2 end,
            raw_capture = case when raw_capture is null then null else $2 end
      where recorded_by_person_id = $1::uuid
         or invitation_id in (select id from public.invitations where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.question_responses = await run(
    tx,
    `update public.question_responses
        set answer_text = case when answer_text is null then null else $2 end,
            raw_capture = case when raw_capture is null then null else $2 end,
            superseded_reason = case when superseded_reason is null then null else $2 end
      where invitation_id in (select id from public.invitations where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.nonresponse_flags = await run(
    tx,
    `update public.nonresponse_flags
        set resolution = case when resolution is null then null else $2 end
      where resolved_by_person_id = $1::uuid
         or invitation_id in (select id from public.invitations where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );

  // Recruitment: the notes somebody wrote about them, and the answers they
  // gave on the sign-up form.
  scrubbed.recruitment_prospect_notes = await run(
    tx,
    `update public.recruitment_prospect_notes
        set note = $2,
            author_label = case when author_label is null then null else $2 end
      where author_person_id = $1::uuid
         or prospect_id in (select id from public.recruitment_prospects where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.recruitment_prospect_status_events = await run(
    tx,
    `update public.recruitment_prospect_status_events
        set actor_label = case when actor_label is null then null else $2 end,
            reason = case when reason is null then null else $2 end
      where actor_person_id = $1::uuid
         or prospect_id in (select id from public.recruitment_prospects where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.recruitment_questionnaire_responses = await run(
    tx,
    `update public.recruitment_questionnaire_responses
        set answer_text = case when answer_text is null then null else $2 end,
            answer_choice = case when answer_choice is null then null else $2 end
      where prospect_id in (select id from public.recruitment_prospects where person_id = $1::uuid)`,
    [personId, ERASED_TEXT],
  );
  scrubbed.recruitment_prospects = await run(
    tx,
    `update public.recruitment_prospects
        set source = case when source is null then null else $2 end
      where person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );

  // Follow-ups and seats: what somebody wrote about them, in words — or, when
  // this person is the owner rather than the subject, what they wrote in
  // their own free text about somebody else's follow-up or appointment.
  scrubbed.follow_up_actions = await run(
    tx,
    `update public.follow_up_actions
        set description = $2,
            resolution_note = case when resolution_note is null then null else $2 end
      where subject_person_id = $1::uuid or owner_person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );
  scrubbed.role_assignments = await run(
    tx,
    `update public.role_assignments
        set note = case when note is null then null else $2 end
      where person_id = $1::uuid or appointed_by_person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );

  // The reason a fixture's date, time, venue or opponent changed, as
  // recorded or approved by them — the schedule fact itself (what changed,
  // to what) has no separate subject and stays; only their own words go.
  scrubbed.schedule_changes = await run(
    tx,
    `update public.schedule_changes
        set reason = case when reason is null then null else $2 end
      where recorded_by_person_id = $1::uuid or approved_by_person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );

  // The legacy file they were matched out of, which is raw name, email and
  // phone as the club's own spreadsheet had it.
  scrubbed.legacy_roster_rows = await run(
    tx,
    `update staging.legacy_roster_rows
        set raw_name = $2,
            raw_email = case when raw_email is null then null else $2 end,
            raw_phone = case when raw_phone is null then null else $2 end,
            raw_extra = case when raw_extra is null then null else '{}'::jsonb end
      where matched_person_id = $1::uuid`,
    [personId, ERASED_TEXT],
  );

  // The audit trail. Rows keep pointing at the tombstone — that is the whole
  // point of a tombstone — and stop carrying what the person was called or
  // what was written about them. `context` is rebuilt rather than patched:
  // it is arbitrary JSON, and no rule says which of its keys hold a name.
  scrubbed.audit_events = await run(
    tx,
    `update public.audit_events
        set actor_label = case when actor_label is null then null else $2 end,
            from_state = case when from_state is null then null else $2 end,
            to_state = case when to_state is null then null else $2 end,
            reason = case when reason is null then null else $2 end,
            context = jsonb_build_object('erased', true)
      where actor_person_id = $1::uuid
         or (entity_table = 'people' and entity_id = $1::uuid)
         or (entity_table = 'season_memberships' and entity_id in (
              select id from public.season_memberships where person_id = $1::uuid))`,
    [personId, ERASED_TEXT],
  );

  // -------------------------------------------------------------------------
  // The tombstone itself. Never deleted: the row is what every record above
  // still points at, and the database's own check refuses a stamped row that
  // still carries identity.
  // -------------------------------------------------------------------------

  scrubbed.people = await run(
    tx,
    `update public.people
        set given_name = $2,
            family_name = null,
            middle_name = null,
            college = null,
            degree_field = null,
            matriculation_year = null,
            expected_graduation_year = null,
            date_of_birth = null,
            student_number = null,
            bafa_registration_number = null,
            merge_reason = null,
            erased_at = now(),
            updated_at = now()
      where id = $1::uuid`,
    [personId, ERASED_DISPLAY_NAME],
  );

  return {
    deleted,
    scrubbed,
    tokensRevoked: personTokens + rsvpTokens,
    jobsCancelled,
  };
}
