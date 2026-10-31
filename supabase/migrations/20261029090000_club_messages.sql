-- LAN-514 — Messages: one email, with attachments, to an audience the club
-- chooses (Brian and Stewart, 29 October 2026; first pass for Brian's review).
--
-- Stewart: coaches share playbooks through Google Drive and lose track of who
-- has them. A message here goes only to people already in the system, by email
-- only, through the same delivery records, Messaging queue and messaging
-- safety every other message uses.
--
-- Two tables, and nothing on `notification_jobs`. Each recipient's send is an
-- ordinary `other` job keyed `club-message:<message id>:<person id>` — the
-- attendance sheet's shape (LAN-465) — so the per-recipient delivery record,
-- the queue row and the safety admission are the existing ones. What is new is
-- only what an existing table cannot hold: the message the operator wrote, and
-- the files attached to it.
--
--   * `club_messages` — subject, body, the groups ticked, how many people it
--     was queued for and how many had no email, when it goes, who sent it.
--   * `club_message_attachments` — the files, as bytes. An attachment is
--     uploaded before the message exists (in chunks, so no request is larger
--     than the proxy buffers), so `club_message_id` is null until the send
--     claims it; `complete` says every byte has arrived.
--
-- Sizes are the service's rule, not a constraint here: Resend refuses an email
-- over 40 MB after base64 encoding, so the files may total about 30 MB. The one
-- check below is the per-file ceiling a chunked upload must never exceed.

create table public.club_messages (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  -- The group tokens the operator ticked, as the event audience builder stores
  -- them (`event_audience_groups.group_token`'s vocabulary). Display only: the
  -- recipients are the jobs, resolved when the message was sent.
  audience_groups text[] not null default '{}',
  recipient_count integer not null,
  unreachable_count integer not null default 0,
  scheduled_for timestamptz not null,
  sent_by_person_id uuid not null references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint club_messages_subject_present check (length(btrim(subject)) between 1 and 200),
  constraint club_messages_body_present check (length(btrim(body)) between 1 and 20000),
  constraint club_messages_counts_non_negative check (
    recipient_count >= 0 and unreachable_count >= 0
  )
);

create index club_messages_scheduled_for_idx on public.club_messages (scheduled_for desc);

comment on table public.club_messages is
  'LAN-514. One email the club wrote to an audience it chose (Messages). Each recipient''s send is a notification_jobs row keyed club-message:<id>:<person id>; this row is the message itself.';
comment on column public.club_messages.audience_groups is
  'The audience group tokens ticked when it was sent, for display. The recipients are the jobs.';
comment on column public.club_messages.unreachable_count is
  'People chosen who had no current email, so no job was queued for them.';

create table public.club_message_attachments (
  id uuid primary key default gen_random_uuid(),
  club_message_id uuid references public.club_messages (id) on delete cascade,
  uploaded_by_person_id uuid not null references public.people (id) on delete restrict,
  position integer not null default 0,
  filename text not null,
  content_type text not null,
  byte_size integer not null,
  content bytea not null default ''::bytea,
  complete boolean not null default false,
  created_at timestamptz not null default now(),

  constraint club_message_attachments_filename_present check (
    length(btrim(filename)) between 1 and 255
  ),
  -- 30 MB of files is the most one email can carry (Resend's 40 MB after
  -- encoding); one file can be no larger than that.
  constraint club_message_attachments_size_bounded check (
    byte_size between 1 and 31457280 and octet_length(content) <= byte_size
  ),
  constraint club_message_attachments_complete_when_whole check (
    not complete or octet_length(content) = byte_size
  ),
  constraint club_message_attachments_sent_only_when_complete check (
    club_message_id is null or complete
  )
);

create index club_message_attachments_message_idx
  on public.club_message_attachments (club_message_id, position);
create index club_message_attachments_unclaimed_idx
  on public.club_message_attachments (uploaded_by_person_id, created_at)
  where club_message_id is null;

comment on table public.club_message_attachments is
  'LAN-514. A file attached to a club message, stored as bytes. Uploaded in chunks before the message exists (club_message_id null) and claimed by the send; an unclaimed upload is removed after a day.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.club_messages enable row level security;
alter table public.club_message_attachments enable row level security;

revoke all on table public.club_messages from anon, authenticated, service_role;
revoke all on table public.club_message_attachments from anon, authenticated, service_role;

-- The server writes a message once and reads it; nothing edits one afterwards.
grant select, insert on table public.club_messages to service_role;
-- Uploads append chunks and are claimed by the send (update), and an unclaimed
-- upload is cleared away (delete).
grant select, insert, update, delete on table public.club_message_attachments to service_role;
