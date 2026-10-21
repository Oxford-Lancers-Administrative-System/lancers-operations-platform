-- LAN-508 — event messages, the game day brief (Brian, 21 October 2026).
--
-- An event carries zero or more event messages. Each is sent a whole number of
-- hours before the event starts, by WhatsApp, email or both, to everyone
-- invited or to those whose answer is Yes at the moment it goes. The brief is
-- the coach's own Markdown; WhatsApp carries it as a 900px-wide image header on
-- `lancers_event_brief_image_v1`, email carries the same content in the club
-- shell.
--
-- Four tables:
--
--   * `event_messages` — the messages an event carries, edited on the event
--     form (draft) and the edit page (approved). Ordinary mutable rows.
--   * `event_template_messages` — the skeleton a template hands to every new
--     event made from it. Never touches an existing event.
--   * `event_message_sends` — every version that was sent, append-only. The
--     first send is the schedule's; every later one is an operator's
--     "Save and send again", and names that operator.
--   * `event_message_send_recipients` — who each send went to, append-only.
--     A resend goes to exactly the people of the previous send.
--
-- There is no stored send time. It is derived (event start less the hours,
-- held to 07:00 by lights-out), so a moved event moves every unsent message
-- and a cancelled event sends none, without any write here. The sends
-- themselves are ordinary `notification_jobs` rows (`job_type = 'other'`, key
-- `event-message:<send>:<person>:<channel>`), so the Messaging queue, the
-- safety limits and the delivery records see them like any other message.

begin;

create type public.event_message_channel as enum ('whatsapp', 'email', 'both');
create type public.event_message_recipients as enum ('everyone', 'yes');

comment on type public.event_message_channel is
  'LAN-508. How an event message goes: WhatsApp, email, or both. A recipient without season WhatsApp consent gets the email whatever this says.';
comment on type public.event_message_recipients is
  'LAN-508. Who an event message goes to: everyone invited, or those whose answer is Yes when it goes.';

-- ---------------------------------------------------------------------------
-- The messages an event carries
-- ---------------------------------------------------------------------------

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sort_order smallint not null default 0,
  hours_before smallint not null,
  channel public.event_message_channel not null,
  recipients public.event_message_recipients not null,
  body text not null,
  from_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A send keys on (id, event_id), so a send can never name a message of
  -- another event.
  constraint event_messages_id_event_key unique (id, event_id),
  -- At least an hour, at most two weeks: further out than the invitation lead
  -- is not a brief, and zero would race the start.
  constraint event_messages_hours_before_is_sane check (hours_before between 1 and 336),
  constraint event_messages_body_not_blank check (btrim(body) <> ''),
  constraint event_messages_body_is_bounded check (char_length(body) <= 4000)
);

create index event_messages_event_idx on public.event_messages (event_id, sort_order);

comment on table public.event_messages is
  'LAN-508. The event messages an event carries: hours before the start, channel, recipients and the Markdown brief. The send time is derived from the event start, never stored.';
comment on column public.event_messages.body is
  'The brief as the coach typed it, in Markdown. Free text: may name people, so it is hidden from the agent read-only role.';
comment on column public.event_messages.from_template is
  'Arrived from the event''s template and not edited since, so a type change on a draft may take it away again.';

-- ---------------------------------------------------------------------------
-- The skeleton a template hands to a new event
-- ---------------------------------------------------------------------------

create table public.event_template_messages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.event_templates (id) on delete cascade,
  sort_order smallint not null default 0,
  hours_before smallint not null,
  channel public.event_message_channel not null,
  recipients public.event_message_recipients not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint event_template_messages_hours_before_is_sane check (hours_before between 1 and 336),
  constraint event_template_messages_body_not_blank check (btrim(body) <> ''),
  constraint event_template_messages_body_is_bounded check (char_length(body) <= 4000)
);

create index event_template_messages_template_idx
  on public.event_template_messages (template_id, sort_order);

comment on table public.event_template_messages is
  'LAN-508. Event messages a template carries. Copied onto each new event made from the template; never onto an existing one.';

-- ---------------------------------------------------------------------------
-- Every version that was sent, and to whom
-- ---------------------------------------------------------------------------

create table public.event_message_sends (
  id uuid primary key default gen_random_uuid(),
  event_message_id uuid not null,
  event_id uuid not null,
  version smallint not null,
  hours_before smallint not null,
  channel public.event_message_channel not null,
  recipients public.event_message_recipients not null,
  body text not null,
  sent_at timestamptz not null default now(),
  resent_by_person_id uuid references public.people (id),
  -- A message that has been sent cannot be deleted: its history is here.
  constraint event_message_sends_message_fkey
    foreign key (event_message_id, event_id)
    references public.event_messages (id, event_id) on delete restrict,
  constraint event_message_sends_version_key unique (event_message_id, version),
  constraint event_message_sends_version_is_positive check (version >= 1),
  -- The first send is the schedule's; every later one is an operator's resend.
  constraint event_message_sends_resend_is_attributed check (
    (version = 1) = (resent_by_person_id is null))
);

create index event_message_sends_event_idx on public.event_message_sends (event_id);

comment on table public.event_message_sends is
  'LAN-508. Append-only. Each version of an event message that was sent, as it was sent. Version 1 is the scheduled send; later versions are "Save and send again".';
comment on column public.event_message_sends.body is
  'The brief exactly as this version was sent. Free text: hidden from the agent read-only role.';

create table public.event_message_send_recipients (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.event_message_sends (id) on delete restrict,
  person_id uuid not null references public.people (id) on delete restrict
);

-- No unique (send_id, person_id): a person merge re-points person_id blindly,
-- and two merged records that both received one send must not refuse it.
-- Readers take distinct people.
create index event_message_send_recipients_send_idx
  on public.event_message_send_recipients (send_id);
create index event_message_send_recipients_person_idx
  on public.event_message_send_recipients (person_id);

comment on table public.event_message_send_recipients is
  'LAN-508. Append-only. The people one event message send went to; a resend goes to exactly these.';

-- ---------------------------------------------------------------------------
-- Posture
-- ---------------------------------------------------------------------------

alter table public.event_messages enable row level security;
alter table public.event_template_messages enable row level security;
alter table public.event_message_sends enable row level security;
alter table public.event_message_send_recipients enable row level security;

revoke all on table public.event_messages, public.event_template_messages,
  public.event_message_sends, public.event_message_send_recipients
  from anon, authenticated, service_role;

-- The editable rows: the server reads and rewrites them.
grant select, insert, update, delete on table public.event_messages to service_role;
grant select, insert, update, delete on table public.event_template_messages to service_role;
-- History: written once, never rewritten.
grant select, insert on table public.event_message_sends to service_role;
grant select, insert on table public.event_message_send_recipients to service_role;

commit;
