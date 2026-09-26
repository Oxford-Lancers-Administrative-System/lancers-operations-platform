-- LAN-429 (mission M-GRANULAR-ROLES-AND-PERMISSIONS, parent LAN-423) — the
-- grants foundation.
--
-- Until now every seat's access was a frozen code map in
-- `src/lib/auth/capabilities.ts`. Brian's decisions of 2026-09-25 (LAN-424,
-- approved packet `missions/packets/M-GRANULAR-ROLES-AND-PERMISSIONS/`) move
-- the part of it the committee needs to change into data, edited on the seat
-- page by the holders of `role_management`:
--
--   * eleven roster categories — the board's ten groups plus Contact &
--     emergency — each None / View / Edit;
--   * three recruiting categories — Person information and Recruit details
--     None / View / Edit, Event details None / View;
--   * one line per event template, None / View / Manage, for every template
--     including those added later;
--   * two switches, may add to the roster and may add recruits, No / Yes.
--
-- Three things live here and nowhere else:
--
--   1. `role_access_grants`, one row per (seat, line), and its seed: the
--      President, General Manager, IT Officer, Vice-President and Secretary
--      at the maximum of every line, every other seat at `none`. The floor
--      (President, General Manager and IT Officer fixed at full) is a service
--      rule in `src/lib/services/access-grants.ts`, not a row or a trigger:
--      the rows are ordinary and the refusal is `NotPermitted`.
--   2. `roster_group_colours`, the club's colour for each of the ten board
--      groups, seeded from the packet (W2).
--   3. `event_templates_colour_key_known` gains `lancer_gold`, the thirteenth
--      swatch. Re-toning `blue` to Oxford Blue needs no migration: the key is
--      kept and the hex lives in `src/lib/services/event-template-input.ts`.
--
-- Level vocabularies are check constraints rather than enum types, as
-- `event_templates.colour_key` is: they are short closed lists that restate a
-- TypeScript module (`src/lib/auth/grants.ts`), and a check constraint is the
-- cheaper of the two to extend by a later forward migration.

-- ---------------------------------------------------------------------------
-- 1. role_access_grants
-- ---------------------------------------------------------------------------

create table public.role_access_grants (
  -- A surrogate key, as every table here has one: the owner-run showcase
  -- rollback deletes by `id` and refuses a table that has none.
  id uuid primary key default gen_random_uuid(),

  role_id uuid not null references public.roles (id) on delete restrict,

  -- What the line is about. `event_template` lines name their template by
  -- `template_id` and carry no `subject_key`; every other kind names its line
  -- by `subject_key` and carries no `template_id`.
  subject_kind text not null,
  subject_key text,

  -- A template's grant lines go with the template: deleting one is the only
  -- way a line disappears, and the service audits the loss.
  template_id uuid references public.event_templates (id) on delete cascade,

  level text not null,

  -- Maintained by the service layer, not a trigger — Conventions.
  updated_at timestamptz not null default now(),

  -- One line per seat per subject. NULLS NOT DISTINCT so a template line
  -- (null key) and a category line (null template) are each unique too.
  constraint role_access_grants_one_line_per_subject
    unique nulls not distinct (role_id, subject_kind, subject_key, template_id),

  constraint role_access_grants_subject_kind_known check (
    subject_kind in ('roster_category', 'recruiting_category', 'event_template', 'switch')
  ),

  constraint role_access_grants_subject_shape check (
    case subject_kind
      when 'event_template' then template_id is not null and subject_key is null
      else subject_key is not null and template_id is null
    end
  ),

  -- The vocabulary, pinned line by line. `src/lib/auth/grants.ts` states the
  -- same lists; the printed-access test reads what this migration left.
  constraint role_access_grants_vocabulary check (
    case subject_kind
      when 'roster_category' then
        subject_key in (
          'person', 'contact_emergency', 'onboarding', 'membership', 'availability',
          'coaching', 'offensive', 'defensive', 'special_teams', 'warmup', 'kit'
        )
        and level in ('none', 'view', 'edit')
      when 'recruiting_category' then
        (subject_key in ('recruit_person', 'recruit_details') and level in ('none', 'view', 'edit'))
        or (subject_key = 'recruit_events' and level in ('none', 'view'))
      when 'event_template' then
        level in ('none', 'view', 'manage')
      when 'switch' then
        subject_key in ('add_to_roster', 'add_recruits') and level in ('none', 'yes')
      else false
    end
  )
);

create index role_access_grants_template_idx on public.role_access_grants (template_id)
  where template_id is not null;

comment on table public.role_access_grants is
  'LAN-429 (LAN-423). What each seat may see and change, one row per (seat, line): eleven roster categories and three recruiting categories (none/view/edit; Event details none/view), one line per event template (none/view/manage) and two switches (none/yes). An operator''s effective access is the union-maximum over their current seats, read once per request (`resolveOperatorAccess`). Edited on the seat page by `role_management` holders through `src/lib/services/access-grants.ts`, which refuses any change to the President, General Manager and IT Officer (the floor is a service rule, not a row). A template''s lines cascade with it. Every change is audited in `audit_events`.';

comment on column public.role_access_grants.subject_kind is
  'roster_category | recruiting_category | event_template | switch. The vocabulary of each is `role_access_grants_vocabulary`, restating `src/lib/auth/grants.ts`.';

comment on column public.role_access_grants.level is
  'none | view | edit for categories (recruit_events: none | view); none | view | manage for a template; none | yes for a switch. Absence of a row reads as none.';

-- The seed. Every seat gets every line: the five seats Brian named at the
-- maximum of each line, every other seat at `none` (W1, "Floor").
with full_seats(code) as (
  values ('president'), ('general_manager'), ('it_officer'), ('vice_president'), ('secretary')
),
lines(subject_kind, subject_key, maximum) as (
  values
    ('roster_category', 'person', 'edit'),
    ('roster_category', 'contact_emergency', 'edit'),
    ('roster_category', 'onboarding', 'edit'),
    ('roster_category', 'membership', 'edit'),
    ('roster_category', 'availability', 'edit'),
    ('roster_category', 'coaching', 'edit'),
    ('roster_category', 'offensive', 'edit'),
    ('roster_category', 'defensive', 'edit'),
    ('roster_category', 'special_teams', 'edit'),
    ('roster_category', 'warmup', 'edit'),
    ('roster_category', 'kit', 'edit'),
    ('recruiting_category', 'recruit_person', 'edit'),
    ('recruiting_category', 'recruit_details', 'edit'),
    ('recruiting_category', 'recruit_events', 'view'),
    ('switch', 'add_to_roster', 'yes'),
    ('switch', 'add_recruits', 'yes')
)
insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id,
       lines.subject_kind,
       lines.subject_key,
       null,
       case when roles.code in (select code from full_seats) then lines.maximum else 'none' end
  from public.roles
 cross join lines;

insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id,
       'event_template',
       null,
       templates.id,
       case
         when roles.code in ('president', 'general_manager', 'it_officer', 'vice_president', 'secretary')
           then 'manage'
         else 'none'
       end
  from public.roles
 cross join public.event_templates templates;

alter table public.role_access_grants enable row level security;

revoke all on table public.role_access_grants from anon, authenticated, service_role;

-- The narrow server need: the per-request resolution reads it through the
-- service-role client; the seat page's writes update and, for a template or
-- a seat that has no row yet, insert. No delete: a line leaves only with its
-- template, through the cascade.
grant select, insert, update on table public.role_access_grants to service_role;

-- ---------------------------------------------------------------------------
-- 2. roster_group_colours
-- ---------------------------------------------------------------------------

create table public.roster_group_colours (
  -- The board's ten groups. Contact & emergency has no board columns and no
  -- colour of its own; its record section wears Person's.
  group_key text primary key,

  -- A palette key, never a hex value, exactly as `event_templates.colour_key`.
  colour_key text not null,

  -- Maintained by the service layer, not a trigger — Conventions.
  updated_at timestamptz not null default now(),

  constraint roster_group_colours_group_known check (
    group_key in (
      'person', 'onboarding', 'membership', 'availability', 'coaching',
      'offensive', 'defensive', 'special_teams', 'warmup', 'kit'
    )
  ),

  constraint roster_group_colours_colour_key_known check (
    colour_key in (
      'blue', 'teal', 'purple', 'red', 'orange', 'green', 'slate',
      'indigo', 'pink', 'brown', 'cyan', 'lime', 'lancer_gold'
    )
  )
);

comment on table public.roster_group_colours is
  'LAN-429 (W2 of LAN-423). The colour each of the roster board''s ten groups wears on the board and the record, as a palette key from `TEMPLATE_COLOUR_PALETTE` (`src/lib/services/event-template-input.ts`). Edited by `role_management` holders from the roster''s Edit categories; every save is one `roster.group_colours.changed` audit row.';

insert into public.roster_group_colours (group_key, colour_key) values
  ('person', 'blue'),
  ('membership', 'blue'),
  ('onboarding', 'lancer_gold'),
  ('kit', 'lancer_gold'),
  ('availability', 'slate'),
  ('coaching', 'indigo'),
  ('offensive', 'teal'),
  ('defensive', 'purple'),
  ('special_teams', 'brown'),
  ('warmup', 'cyan');

alter table public.roster_group_colours enable row level security;

revoke all on table public.roster_group_colours from anon, authenticated, service_role;

-- Read by every roster surface; the ten rows are updated, never added or
-- removed.
grant select, update on table public.roster_group_colours to service_role;

-- ---------------------------------------------------------------------------
-- 3. The thirteenth swatch
-- ---------------------------------------------------------------------------

alter table public.event_templates
  drop constraint event_templates_colour_key_known;

alter table public.event_templates
  add constraint event_templates_colour_key_known check (
    colour_key in (
      'blue', 'teal', 'purple', 'red', 'orange', 'green', 'slate',
      'indigo', 'pink', 'brown', 'cyan', 'lime', 'lancer_gold'
    )
  );
