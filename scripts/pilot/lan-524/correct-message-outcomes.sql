-- LAN-524 — make the Messaging queue's failures true failures, and stop
-- emails nobody will ever report on reading Attempted.
--
-- Brian runs this by hand, once, against the hosted database, after the
-- LAN-524 code is deployed. No agent runs it there. Read
-- scripts/pilot/lan-524/README.md first.
--
-- Three corrections, one transaction:
--
--   1. WhatsApp receipts that say a message cannot be delivered — a number
--      that is not on WhatsApp, a blocked contact, a missing template — were
--      stored with outcome 'failed', which reads Retryable while attempts
--      remain. No retry can deliver them. They become 'rejected' and read
--      Failed, as the same code refused at send time already does. Matched on
--      an attempt WhatsApp accepted (so a receipt, never a send-time refusal)
--      and on the exact sentence the application stores for a terminal code.
--
--   2. Emails the old 30-day sweep marked failed with WhatsApp's "delivery
--      window" wording before LAN-480 limited it to WhatsApp. Nothing said
--      they failed. Their result is removed and the job returns to the state
--      LAN-501 reads as Unknown: sent, outcome never coming, no Retry.
--
--   3. Emails accepted before the club received email delivery receipts (the
--      first arrived on 31 October 2026, 18:30 UTC) that nothing ever
--      reported on. Their attempt is concluded with no outcome, which LAN-501
--      reads as Unknown, exactly as LAN-472 did for WhatsApp.
--
-- It writes delivery_results (outcome; and deletes the false email failures),
-- delivery_attempts (concluded_at, failure_reason) and notification_jobs
-- (status, last_error, claim). It creates nothing and needs no cleanup.
-- Running it a second time changes nothing.

begin;

-- ---------------------------------------------------------------------------
-- Preflight: where this is running, and what it is about to do
-- ---------------------------------------------------------------------------
select current_database() as database, current_user as run_as, now() as started_at;

do $preflight$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'delivery_outcome' and e.enumlabel = 'rejected'
  ) then
    raise exception 'LAN-524: delivery_outcome has no rejected value; wrong database, stopping.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'delivery_attempts'
       and column_name = 'concluded_at'
  ) then
    raise exception 'LAN-524: delivery_attempts has no concluded_at column; wrong database, stopping.';
  end if;
end
$preflight$;

-- The sentences the application stores for a WhatsApp code no retry can clear.
drop table if exists pg_temp.lan524_terminal_reasons;
create temporary table lan524_terminal_reasons (reason text primary key) on commit drop;
insert into lan524_terminal_reasons (reason) values
  ('WhatsApp would not deliver this message because the club has no open conversation with this person and the message was not an approved template.'),
  ('WhatsApp could not deliver to this number — it may not be a WhatsApp account.'),
  ('This number is not on the provider''s permitted recipient list.'),
  ('This person has chosen to stop receiving marketing messages from the club on WhatsApp; reminders may still reach them.'),
  ('WhatsApp would not deliver this message because this person is blocked by the club.'),
  ('The approved message template did not match what was sent.'),
  ('The message template named for invitations does not exist on the club''s account.'),
  ('The message template named for invitations has been paused by the provider.'),
  ('The message template named for invitations has been disabled by the provider.'),
  ('The club''s provider credential has expired or been revoked, so nothing could be sent.');

-- 1. WhatsApp receipts for messages that cannot be delivered.
drop table if exists pg_temp.lan524_receipts;
create temporary table lan524_receipts on commit drop as
select r.id
  from public.delivery_results r
  join public.delivery_attempts a
    on a.notification_job_id = r.notification_job_id
   and a.attempt_number = r.attempt_number
 where r.outcome = 'failed'
   and r.channel = 'whatsapp'
   and a.accepted_at is not null
   and r.detail in (select reason from lan524_terminal_reasons);

-- 2. Emails the old sweep marked failed, still the job's latest attempt.
drop table if exists pg_temp.lan524_swept_emails;
create temporary table lan524_swept_emails on commit drop as
select r.id as result_id, r.notification_job_id as job_id, a.id as attempt_id,
       a.requested_at
  from public.delivery_results r
  join public.delivery_attempts a
    on a.notification_job_id = r.notification_job_id
   and a.attempt_number = r.attempt_number
  join public.notification_jobs j on j.id = r.notification_job_id
 where r.channel = 'email'
   and r.outcome = 'failed'
   and r.detail = 'WhatsApp accepted this message and never confirmed it reached the phone, and its delivery window has now passed, so it will not arrive. Nothing was delivered and nothing was recalled.'
   and a.accepted_at is not null
   and j.status = 'failed'
   and j.held_at is null
   and r.attempt_number = j.attempt_count;

-- 3. Emails accepted before receipts existed, never reported on.
drop table if exists pg_temp.lan524_unreported_emails;
create temporary table lan524_unreported_emails on commit drop as
select a.id as attempt_id
  from public.delivery_attempts a
  join public.notification_jobs j
    on j.id = a.notification_job_id
   and a.attempt_number = j.attempt_count
 where a.channel = 'email'
   and a.accepted_at is not null
   and a.accepted_at < timestamptz '2026-10-31 18:00:00+00'
   and a.concluded_at is null
   and j.status = 'processing'
   and not exists (
     select 1 from public.delivery_results r
      where r.notification_job_id = a.notification_job_id
        and r.attempt_number = a.attempt_number);

-- The preview, before any write. Keep this output; it is the record.
select '1. WhatsApp cannot deliver: Retryable to Failed' as correction, count(*) as rows
  from lan524_receipts
union all
select '2. Email falsely failed: to Unknown', count(*) from lan524_swept_emails
union all
select '3. Email never reported: Attempted to Unknown', count(*) from lan524_unreported_emails;

-- ---------------------------------------------------------------------------
-- The corrections
-- ---------------------------------------------------------------------------

-- 1.
update public.delivery_results r
   set outcome = 'rejected'
  from lan524_receipts t
 where r.id = t.id
   and r.outcome = 'failed';

-- 2. The attempt keeps its conclusion; only the false verdict goes.
delete from public.delivery_results r
 using lan524_swept_emails t
 where r.id = t.result_id;

update public.delivery_attempts a
   set failure_reason = 'Sent before the club received email delivery receipts, so whether it arrived will never be known.'
  from lan524_swept_emails t
 where a.id = t.attempt_id;

update public.notification_jobs j
   set status = 'processing', last_error = null,
       claimed_at = t.requested_at, claimed_by = 'LAN-524 correction',
       next_attempt_at = null, updated_at = now()
  from lan524_swept_emails t
 where j.id = t.job_id;

-- 3.
update public.delivery_attempts a
   set concluded_at = now(),
       failure_reason = 'Sent before the club received email delivery receipts, so whether it arrived will never be known.'
  from lan524_unreported_emails t
 where a.id = t.attempt_id;

-- ---------------------------------------------------------------------------
-- Verification: nothing targeted is left as it was
-- ---------------------------------------------------------------------------
do $verify$
begin
  if exists (
    select 1 from public.delivery_results r
      join lan524_receipts t on t.id = r.id
     where r.outcome <> 'rejected'
  ) then
    raise exception 'LAN-524: a terminal WhatsApp receipt is still failed; rolling back.';
  end if;
  if exists (
    select 1 from public.delivery_results r
      join lan524_swept_emails t on t.result_id = r.id
  ) or exists (
    select 1 from public.notification_jobs j
      join lan524_swept_emails t on t.job_id = j.id
     where j.status <> 'processing'
  ) then
    raise exception 'LAN-524: a falsely failed email was not returned to Unknown; rolling back.';
  end if;
  if exists (
    select 1 from public.delivery_attempts a
      join lan524_unreported_emails t on t.attempt_id = a.id
     where a.concluded_at is null
  ) then
    raise exception 'LAN-524: an unreported email is still open; rolling back.';
  end if;
end
$verify$;

select '1. WhatsApp cannot deliver, now rejected' as check, count(*) as rows
  from public.delivery_results r join lan524_receipts t on t.id = r.id
 where r.outcome = 'rejected'
union all
select '2. Email returned to Unknown', count(*)
  from public.notification_jobs j join lan524_swept_emails t on t.job_id = j.id
 where j.status = 'processing'
union all
select '3. Email concluded to Unknown', count(*)
  from public.delivery_attempts a join lan524_unreported_emails t on t.attempt_id = a.id
 where a.concluded_at is not null;

commit;
