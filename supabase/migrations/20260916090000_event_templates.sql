-- Templates become things operators create, name and rename. LAN-265, LAN-276.
--
-- Brian, with Stu and Clint, 2026-09-09: "A template is anything the operators
-- want to create: 'Kicking Clinic', 'Full Pads Practice', 'Film Review',
-- whatever they name. It is not a preset of a fixed type. Creating a template
-- also creates its messaging cadence, which starts from a default cadence and
-- can then be edited on the Messaging schedule screen like the seven existing
-- ones. Renaming is free."
--
-- ## What that costs the schema, precisely
--
-- `public.event_type` was the identity of a template. Seven enum values, seven
-- template rows, seven `messaging_schedules` rows, seven `event_type_settings`
-- rows, and `events.event_type` as the thing every label was resolved from.
-- Operators cannot add an enum value — that is a migration and Brian's decision
-- every time — so as long as the enum *is* the template, "create a template" is
-- not an act the application can offer.
--
-- So the enum stops being the identity and becomes the **behavioural class**:
-- the thing the code genuinely needs a closed vocabulary for — the recruitment
-- audience rules (D46), the Monday report's buckets, coach attendance. Every
-- template carries one, the seven existing templates keep theirs, and a template
-- an operator creates gets `practice`. It is never shown to an operator and
-- never chosen by one; `LAN-265` is explicit that new behavioural classes remain
-- a migration and a Brian decision.
--
-- The identity moves to a uuid. `event_templates` gains `id` and `name`;
-- `messaging_schedules`, `event_type_settings` and `events` gain `template_id`;
-- the primary keys and the two template foreign keys move onto it. Nothing is
-- dropped: `event_type` stays a plain column on all of them, which is what makes
-- the class still answerable from a row without a join.
--
-- ## Why the foreign keys are composite
--
-- `(template_id, event_type)` referencing `event_templates (id, event_type)`
-- rather than `template_id` alone, on every table that keeps the denormalised
-- class. The class is copied onto four tables, and a copy that can drift from
-- its source is a copy that eventually does — an event labelled `game` pointing
-- at a template whose class is `practice` would send a game down the practice
-- ladder with nothing to disagree. The composite reference makes the copy
-- provably equal to the source instead of conventionally equal, which is also
-- what keeps `event_template_audience_groups_recruits_are_recruitment_only`
-- meaningful: that check reads its own `event_type` column, and the composite
-- key is what guarantees that column is the template's own class.
--
-- ## Renaming is retroactive, and that is the decision
--
-- An event stores `template_id`, never a label. Rename "Chalk" to "Film Review"
-- and every past chalk session reads "Film Review", exactly as a venue rename
-- would. Brian, 2026-09-09, said so out loud rather than leaving it implied.
--
-- ## Deleting a template
--
-- `events.template_id` references with `on delete restrict`: a template that any
-- event was ever created from cannot be deleted, because deleting it would leave
-- that event unable to say what it is. The service layer refuses first, with a
-- sentence; this is the backstop that makes the refusal true rather than
-- best-effort. A template nothing points at cascades its questions, its default
-- audience, its messaging schedule and its settings row away with it.

-- ---------------------------------------------------------------------------
-- 1. A template gets an identity of its own, and a name
-- ---------------------------------------------------------------------------

alter table public.event_templates
  add column id uuid not null default gen_random_uuid(),
  add column name text;

-- Today's labels, which lived in `TYPE_LABELS` in application code and are now
-- data. The seven rows keep reading exactly as they read yesterday.
--
-- The seven identifiers are **fixed literals, not `gen_random_uuid()`**, and the
-- reason is that these seven rows are schema rather than data: they arrive with
-- the migration, on every machine, and everything that has to name one without
-- reading it back — the local seed, the tester-week showcase loader, a pilot
-- scenario's SQL — would otherwise have to query for an id that differed per
-- database. Each is a UUIDv5 over the namespace
-- `6f2b1d0a-3c47-5e18-9a6d-2b8e4f7c1a55` and the key `event_templates:<class>`,
-- which is the deterministic-identifier idiom the tester-week loader already
-- uses for exactly this problem. Templates an operator creates get
-- `gen_random_uuid()` from the column default, as ordinary data should.
update public.event_templates
   set id = case event_type
              when 'practice' then '7e34a764-7ed1-535e-8cef-73e00a62eafc'
              when 'strength_and_conditioning' then '8fb4acfc-1d41-53b0-bda8-202f454a8629'
              when 'chalk' then 'b547e0b3-f48c-5601-9dc6-e8725fc434f9'
              when 'game' then '67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae'
              when 'social' then '8de00424-52a8-52ad-9c9f-a29823f9c4bf'
              when 'recruitment' then 'ae03257b-292e-5a97-b6ef-c3a6a2b839d7'
              when 'meeting' then '660cdcb7-51e3-5a19-aaa2-08c5256af288'
            end::uuid,
       name = case event_type
     when 'practice' then 'Practice'
     when 'strength_and_conditioning' then 'Strength and conditioning'
     when 'chalk' then 'Chalk'
     when 'game' then 'Game'
     when 'social' then 'Social'
     when 'recruitment' then 'Recruitment'
     when 'meeting' then 'Meeting'
   end;

alter table public.event_templates
  alter column name set not null,
  add constraint event_templates_name_not_blank check (btrim(name) <> '');

-- Case-insensitively unique. Two templates called "Chalk" and "chalk" would be
-- indistinguishable everywhere a name is the only thing shown, which is
-- everywhere.
create unique index event_templates_name_unique
  on public.event_templates (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 2. The identity moves off the enum
-- ---------------------------------------------------------------------------

alter table public.event_template_questions
  drop constraint event_template_questions_event_type_fkey;
alter table public.event_template_audience_groups
  drop constraint event_template_audience_groups_event_type_fkey;

alter table public.event_templates
  drop constraint event_templates_pkey;
alter table public.event_templates
  add constraint event_templates_pkey primary key (id);

-- The target of every composite reference below. Not a second identity: `id` is
-- already unique on its own, and this states that a row's class travels with it.
alter table public.event_templates
  add constraint event_templates_id_and_class unique (id, event_type);

comment on table public.event_templates is
  'LAN-265. What an event created from this template starts as. Operators create, rename and delete these freely; the name is the only thing they are ever shown. `event_type` is the behavioural class underneath (recruitment audience rules, the Monday report''s buckets, coach attendance) — never displayed, never chosen by an operator, `practice` on anything newly created. Every field is optional; template values flow into a draft field by field and only into fields nobody has edited, and approval freezes them (D41, refined 2026-08-21).';
comment on column public.event_templates.name is
  'LAN-265. The club''s own word for this kind of event, and the only label any surface shows for an event created from it — list, event page, public calendar, ICS feed, RSVP page, Monday report. Renaming is retroactive by design (Brian, 2026-09-09): rename "Chalk" to "Film Review" and last term''s chalk sessions read "Film Review", exactly as a venue rename would, with no row in `events` rewritten.';
comment on column public.event_templates.event_type is
  'LAN-265. The behavioural class, not the identity. Kept because a closed vocabulary is genuinely load-bearing in four places — D46''s recruits-on-Recruitment-only rule, the Monday report''s buckets, coach attendance, and the recruit messaging ladder — and none of them can key off a name an operator may change. New classes remain a migration and Brian''s decision.';

-- ---------------------------------------------------------------------------
-- 3. The template's own children follow the identity
-- ---------------------------------------------------------------------------

alter table public.event_template_questions add column template_id uuid;
update public.event_template_questions q
   set template_id = t.id
  from public.event_templates t
 where t.event_type = q.event_type;
alter table public.event_template_questions
  alter column template_id set not null,
  add constraint event_template_questions_template_fkey
    foreign key (template_id, event_type)
    references public.event_templates (id, event_type) on delete cascade,
  drop constraint event_template_questions_unique_per_type,
  add constraint event_template_questions_unique_per_template unique (template_id, prompt);

drop index if exists public.event_template_questions_type_idx;
create index event_template_questions_template_idx
  on public.event_template_questions (template_id, sort_order);

alter table public.event_template_audience_groups add column template_id uuid;
update public.event_template_audience_groups g
   set template_id = t.id
  from public.event_templates t
 where t.event_type = g.event_type;
alter table public.event_template_audience_groups
  alter column template_id set not null,
  drop constraint event_template_audience_groups_key,
  add constraint event_template_audience_groups_key primary key (template_id, audience_group),
  add constraint event_template_audience_groups_template_fkey
    foreign key (template_id, event_type)
    references public.event_templates (id, event_type) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. The cadence and the chase threshold are per template, not per type
-- ---------------------------------------------------------------------------
--
-- This is the half of the decision that makes creating a template worth
-- anything: "Creating a template also creates its messaging cadence, which
-- starts from a default cadence and can then be edited on the Messaging
-- schedule screen like the seven existing ones."
--
-- The completeness rule ADR 0021 and `docs/adr/0036` state survives the rekey
-- unchanged, and is strengthened by it: it used to be "seven types, seven rows,
-- and the service layer refuses an eighth rather than defaulting it". It is now
-- "every template has exactly one row, guaranteed by the primary key and by the
-- foreign key that deletes it with its template" — a template with no cadence is
-- no longer merely refused at approval, it is unrepresentable.

alter table public.messaging_schedules add column template_id uuid;
update public.messaging_schedules s
   set template_id = t.id
  from public.event_templates t
 where t.event_type = s.event_type;
alter table public.messaging_schedules
  alter column template_id set not null,
  drop constraint messaging_schedules_pkey,
  add constraint messaging_schedules_pkey primary key (template_id),
  add constraint messaging_schedules_template_fkey
    foreign key (template_id, event_type)
    references public.event_templates (id, event_type) on delete cascade;

comment on table public.messaging_schedules is
  'The club''s messaging policy, one row per template (W7, rekeyed by LAN-265). Complete over `public.event_templates` with no default arm — the primary key gives every template exactly one row and the foreign key removes it with its template, so an unconfigured template is unrepresentable rather than merely refused. Supersedes ADR 0021''s TypeScript table — see docs/adr/0036-messaging-schedule-configuration.md.';

alter table public.event_type_settings add column template_id uuid;
update public.event_type_settings s
   set template_id = t.id
  from public.event_templates t
 where t.event_type = s.event_type;
alter table public.event_type_settings
  alter column template_id set not null,
  drop constraint event_type_settings_pkey,
  add constraint event_type_settings_pkey primary key (template_id),
  add constraint event_type_settings_template_fkey
    foreign key (template_id, event_type)
    references public.event_templates (id, event_type) on delete cascade;

comment on table public.event_type_settings is
  'Per-template configuration this mission stores and Mission 4 consumes (D75, D77), rekeyed from the event type by LAN-265. One row per template, created with it and deleted with it. Who changed a value is in `audit_events`, which is the club''s audit trail for every entity -- a denormalised actor column here would be a weaker second copy of it.';

-- ---------------------------------------------------------------------------
-- 5. An event says which template it was created from
-- ---------------------------------------------------------------------------
--
-- Backfilled by class, so nothing already scheduled changes: every existing
-- event keeps the type it has and gains the template that type used to be.
--
-- `on delete restrict` rather than cascade or set null, and the choice is the
-- whole of "delete when unused": an event whose template vanished could not say
-- what kind of event it was, and there is no correct label to fall back to once
-- the name is the only label there is.

alter table public.events add column template_id uuid;
update public.events e
   set template_id = t.id
  from public.event_templates t
 where t.event_type = e.event_type;
alter table public.events
  alter column template_id set not null,
  add constraint events_template_fkey
    foreign key (template_id, event_type)
    references public.event_templates (id, event_type) on delete restrict;

create index events_template_idx on public.events (template_id);

comment on column public.events.template_id is
  'LAN-265. The template this event was created from, and the only source of the word an operator, a player or the public reads for it. Set at creation and never changed by an amendment (a different template is a different kind of event, which is a different event). `event_type` beside it is the behavioural class, held equal to the template''s own by `events_template_fkey`.';

-- ---------------------------------------------------------------------------
-- 6. LAN-284 — the joining URL is public, said here as well as in the code
-- ---------------------------------------------------------------------------
--
-- Brian, 2026-09-09, reversing this file's own predecessor. The two places
-- `20260822120000_events_target_state.sql` says "never public" are corrected
-- here rather than edited there, because shared migrations are forward-only.
-- The protection lives on the meeting — a Teams passcode shared privately, on
-- top of the Oxford-domain approval — not on the schedule; publishing the link
-- is safe because the link alone admits nobody. The consequence, accepted
-- knowingly: nothing in this application can verify that a given meeting has a
-- passcode set.

comment on column public.events.joining_url is
  'D20, D21. The online event''s link. **Public** by Brian''s decision of 2026-09-09 (LAN-284), reversing this column''s original comment and the header of 20260822120000_events_target_state.sql: it is shown on the public event page and carried in the subscription feed''s iCal URL property, beside the venue and description already published there. The calendar itself stays open and gains no password gate. Protection belongs on the meeting rather than on the schedule.';

comment on column public.events.delivery_mode is
  'D20. In person or online. `venue` holds an address when in person and a destination when online (D21); `joining_url` is the online event''s link and is public (LAN-284, Brian 2026-09-09).';

-- ---------------------------------------------------------------------------
-- 7. Grants — creating and deleting a template is now an act
-- ---------------------------------------------------------------------------
--
-- RLS stays enabled on all four tables; it was enabled in their creating
-- migrations and nothing here exposes a new one. What changes is the narrow
-- server need. `20260822120000_events_target_state.sql` granted
-- `select, update` and withheld `insert` and `delete` deliberately — "the seven
-- rows are created by this migration and are never created or deleted by an
-- operator (D40)". That is exactly the sentence LAN-265 reverses, so the grants
-- follow it. `anon` and `authenticated` gain nothing, here or anywhere: every
-- read of these tables goes through the service layer.

grant insert, delete on table public.event_templates to service_role;
grant insert, delete on table public.messaging_schedules to service_role;
grant insert, delete on table public.event_type_settings to service_role;

-- ---------------------------------------------------------------------------
-- 8. Colour is a template's own fact, not a guess from its class
-- ---------------------------------------------------------------------------
--
-- LAN-276 correction round 1. Brian, walking the review environment,
-- 2026-09-10: "In the template, swatch color should be something that gets
-- chosen, so it gets added as part of the template." Before this, the
-- calendar coloured a tile by `event_type` — the behavioural class an
-- operator never sees or picks — so every template an operator created
-- showed Practice's blue by accident, because `practice` is
-- `DEFAULT_TEMPLATE_CLASS`. Colour becomes a fact the template itself
-- carries, chosen on the editor from a fixed palette of swatches (never a
-- free hex value), and every surface that used to colour a tile by class
-- reads a template's own colour instead — the calendar legend, every
-- calendar tile, and every event list.
--
-- The column stores the palette **key**, not a hex value, so the palette
-- itself — which colours exist, and what hex each one means — can be
-- re-tuned in `src/lib/services/event-template-input.ts` without a
-- migration. The check constraint below is that module's own list of keys,
-- restated here so the two cannot drift silently.
alter table public.event_templates
  add column colour_key text;

-- The seven seeded rows keep exactly the colours the calendar always gave
-- them — `EVENT_TYPE_COLOURS` in `src/app/calendar/presentation.ts`, before
-- this correction keyed the same seven hex pairs by `event_type`.
update public.event_templates
   set colour_key = case event_type
        when 'practice' then 'blue'
        when 'strength_and_conditioning' then 'teal'
        when 'chalk' then 'purple'
        when 'game' then 'red'
        when 'social' then 'orange'
        when 'recruitment' then 'green'
        when 'meeting' then 'slate'
      end;

alter table public.event_templates
  alter column colour_key set not null,
  add constraint event_templates_colour_key_known check (
    colour_key in (
      'blue', 'teal', 'purple', 'red', 'orange', 'green', 'slate',
      'indigo', 'pink', 'brown', 'cyan', 'lime'
    )
  );

comment on column public.event_templates.colour_key is
  'LAN-276 correction, Brian 2026-09-10. A palette key, never a hex value, chosen on the template editor -- never derived from `event_type`. The calendar legend, every calendar tile and every event list colour by this, so two templates that share a class (every operator-created template, since they all get `practice`) are free to look different, and a template an operator creates no longer shares Practice''s swatch by accident. The seven seeded rows keep the colours the calendar always gave them. The palette itself -- which keys exist and what hex each means -- lives in `src/lib/services/event-template-input.ts`; `event_templates_colour_key_known` is that module''s own list, so the two cannot drift silently.';
