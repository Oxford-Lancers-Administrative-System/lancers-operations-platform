-- LAN-483 — record the messages skipped on purpose as final, not Retryable.
--
-- Brian runs this by hand, once, against the hosted database, after the
-- LAN-483 code is deployed. No agent runs it there. Read
-- scripts/pilot/lan-483/README.md first.
--
-- Before LAN-483 a send the scheduler refused at claim time — a recruit who had
-- already completed the track, one no longer a prospect, no consent, a
-- membership that no longer exists — was recorded with outcome 'failed', and
-- the delivery state reads a 'failed' outcome with attempts remaining as
-- Retryable. The application now records the same refusal as 'rejected'
-- (final). This applies that rule, once, to the rows already stored.
--
-- A claim-time refusal is recognised by its shape, never by its wording (the
-- reasons have been reworded since some of these rows were written): an
-- attempt no provider ever accepted, with no provider message id, requested
-- and concluded in the same instant, whose result repeats the attempt's own
-- failure reason. A provider failure is requested before the provider call and
-- concluded after it, so it never has that shape.
--
-- It writes delivery_results.outcome only, from 'failed' to 'rejected'. It
-- creates nothing, deletes nothing, touches no other table and needs no
-- cleanup. Running it a second time changes nothing.

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
    raise exception 'LAN-483: delivery_outcome has no rejected value; wrong database, stopping.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'delivery_attempts'
       and column_name = 'concluded_at'
  ) then
    raise exception 'LAN-483: delivery_attempts has no concluded_at column; wrong database, stopping.';
  end if;
end
$preflight$;

-- The results to change, held for the preview, the update and the final count.
-- A temporary table, gone at the end of the transaction.
drop table if exists pg_temp.lan483_targets;
create temporary table lan483_targets on commit drop as
select r.id
  from public.delivery_results r
  join public.delivery_attempts a
    on a.notification_job_id = r.notification_job_id
   and a.attempt_number = r.attempt_number
 where r.outcome = 'failed'
   and a.accepted_at is null
   and a.provider_message_id is null
   and a.concluded_at is not null
   and a.requested_at = a.concluded_at
   and r.detail is not distinct from a.failure_reason;

-- The preview, before any write: one row per reason, with how many results
-- change and how many of their jobs read Retryable today. Keep this output.
select left(r.detail, 80) as reason,
       count(*) as results,
       count(*) filter (
         where j.status = 'failed' and j.attempt_count < 5
           and r.attempt_number = (
             select max(x.attempt_number) from public.delivery_results x
              where x.notification_job_id = r.notification_job_id)
       ) as reading_retryable
  from lan483_targets t
  join public.delivery_results r on r.id = t.id
  join public.notification_jobs j on j.id = r.notification_job_id
 group by 1
 order by 2 desc;

-- ---------------------------------------------------------------------------
-- The correction
-- ---------------------------------------------------------------------------
update public.delivery_results r
   set outcome = 'rejected'
  from lan483_targets t
 where r.id = t.id
   and r.outcome = 'failed';

-- ---------------------------------------------------------------------------
-- Verification: no claim-time refusal is left 'failed'
-- ---------------------------------------------------------------------------
do $verify$
begin
  if exists (
    select 1
      from public.delivery_results r
      join public.delivery_attempts a
        on a.notification_job_id = r.notification_job_id
       and a.attempt_number = r.attempt_number
     where r.outcome = 'failed'
       and a.accepted_at is null
       and a.provider_message_id is null
       and a.concluded_at is not null
       and a.requested_at = a.concluded_at
       and r.detail is not distinct from a.failure_reason
  ) then
    raise exception 'LAN-483: a claim-time refusal is still recorded failed; rolling back.';
  end if;
end
$verify$;

select r.outcome::text as outcome, count(*) as results
  from lan483_targets t
  join public.delivery_results r on r.id = t.id
 group by 1;

commit;
