-- LAN-128 (mission M-OPERATOR-ADMIN-WITHOUT-SQL, WP-schema), part 1 of 2:
-- the structure the approved static role catalogue needs. Part 2
-- (`20260819090100_role_catalogue.sql`) carries the catalogue itself.
--
-- Why the catalogue needs structure at all. Until now `public.roles` was
-- created empty by `20260810120300_domain_roles.sql` and filled by exactly one
-- thing: the `ROLE_SPEC` table in `scripts/seed-local.mjs`, which is local-only
-- by design. Hosted therefore had **no roles at all**, so every capability in
-- `src/lib/auth/capabilities.ts` keyed on codes that did not exist in
-- production. The approved packet requires the catalogue to reach hosted and
-- local through the same versioned, reviewable repository artifact, which means
-- a migration — and a migration needs two facts the table could not yet hold:
-- which group a role belongs to and where it sits in that group, and whether
-- the seat admits more than one concurrent holder.
--
-- Nothing here is an invitation to edit the catalogue at runtime. The grants at
-- the foot of this file take `insert`, `update` and `delete` on the catalogue
-- away from the application role, because "administrators cannot create roles
-- or edit grants in the application" is a requirement rather than a convention.

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
-- REQ-static-role-catalogue says the catalogue "appears in that group order".
-- That is a statement about the catalogue, not about a component, so the group
-- and its position are data: a page that lists the roles orders by
-- `role_groups.sort_order, roles.sort_order` and cannot get the order wrong by
-- hard-coding it, and a second consumer cannot disagree with the first.
--
-- Not an enum, for two reasons. An enum's order is its declaration order, which
-- is real but invisible to anything reading rows; and a group carries a
-- club-facing label ("Operational Administration") that an enum label would
-- have to be translated into somewhere, which is the duplicated presentation
-- copy this design is avoiding.
create table public.role_groups (
  id uuid primary key default gen_random_uuid(),
  -- Stable machine key. Code is what the catalogue upsert keys on, so re-running
  -- it can never create a second copy of a group under a new identifier.
  code text not null,
  -- What the club calls it, shown as-is.
  label text not null,
  -- Position of the group in the approved order: Operational Administration,
  -- Club Committee, Coaching Staff.
  sort_order integer not null,
  created_at timestamptz not null default now(),

  constraint role_groups_code_key unique (code),
  constraint role_groups_sort_order_key unique (sort_order),
  constraint role_groups_code_not_blank check (btrim(code) <> ''),
  constraint role_groups_label_not_blank check (btrim(label) <> ''),
  constraint role_groups_sort_order_positive check (sort_order > 0)
);

comment on table public.role_groups is
  'The three approved groupings of the static role catalogue, and the order they appear in (LAN-128). Reference data: the application may read it and may not write it.';

-- ---------------------------------------------------------------------------
-- What a role now says about itself
-- ---------------------------------------------------------------------------
-- `role_group_id` and `sort_order` are added nullable here and required by the
-- catalogue migration that follows, because a row that predates the catalogue
-- cannot be given a group by this file — there is nothing yet to give it. The
-- catalogue supplies the group for all twenty and then makes the columns
-- required, so the end state after both migrations admits no group-less role.
alter table public.roles
  add column role_group_id uuid references public.role_groups (id) on delete restrict,
  add column sort_order integer,
  -- At most one concurrent holder, for a reason the constitution does not
  -- supply. Deliberately NOT the same flag as `is_constitutional_office`:
  --
  --   * the constitution constrains the four Offices and nothing else, and
  --     `is_constitutional_office` already carries that rule, is a
  --     composite-foreign-key target, and is depended on by
  --     `roles_offices_are_committee_seats`. Marking General Manager a
  --     constitutional office to borrow its exclusion constraint would make the
  --     schema state something about the constitution that is false;
  --   * General Manager is single-holder because Brian decided so on
  --     18 August 2026 (packet decision DEC-general-manager-standing), and that
  --     authority can change without the constitution changing — and vice
  --     versa. Two authorities, two flags, two constraints, and a refusal that
  --     names which rule rejected it.
  --
  -- The two are mutually exclusive by check constraint below, so "is this seat
  -- single-holder?" is never answered by reading only one of them; that is what
  -- the generated `admits_multiple_holders` column is for.
  add column is_single_holder_seat boolean not null default false,
  -- Derived once, here, so that no consumer re-derives it and forgets a term.
  add column admits_multiple_holders boolean
    generated always as (not (is_constitutional_office or is_single_holder_seat)) stored;

alter table public.roles
  -- Composite-foreign-key target, exactly as `roles_id_scope_office_key` is for
  -- scope and office: an assignment carries the cardinality fact its own
  -- exclusion constraint needs, and cannot disagree with the role about it.
  add constraint roles_id_single_holder_seat_key unique (id, is_single_holder_seat),
  add constraint roles_single_holder_seat_is_not_an_office
    check (not (is_single_holder_seat and is_constitutional_office)),
  -- Two roles in one group may not claim the same position.
  add constraint roles_group_sort_order_key unique (role_group_id, sort_order),
  add constraint roles_sort_order_positive check (sort_order is null or sort_order > 0);

comment on column public.roles.role_group_id is
  'Which of the three approved catalogue groups this seat belongs to (LAN-128).';
comment on column public.roles.sort_order is
  'Position within the group, in the approved catalogue order (LAN-128).';
comment on column public.roles.is_single_holder_seat is
  'At most one concurrent holder, for an authority other than the constitution — today General Manager alone, decided by Brian on 18 August 2026. The constitutional Offices carry their own rule in is_constitutional_office.';
comment on column public.roles.admits_multiple_holders is
  'Derived: true when neither single-holder rule applies. The one column a reader should consult for "may this seat have more than one holder?".';

-- ---------------------------------------------------------------------------
-- The cardinality rule, on assignments
-- ---------------------------------------------------------------------------
-- Denormalised from `roles` for the same reason `scope` and
-- `is_constitutional_office` already are: the rule below has to be a
-- declarative constraint, and a constraint cannot look at another table. The
-- composite foreign key makes disagreement with the role impossible — an
-- assignment that claims General Manager is not single-holder is refused, and
-- an assignment that claims Kit Manager is is refused too.
--
-- The default is `false` because nineteen of the twenty roles are, and because
-- the composite foreign key makes a wrong default loud rather than silent: an
-- insert for General Manager that leaves the column alone fails the foreign
-- key instead of quietly recording an unconstrained twentieth seat.
alter table public.role_assignments
  add column is_single_holder_seat boolean not null default false;

alter table public.role_assignments
  add constraint role_assignments_agree_with_single_holder_rule
    foreign key (role_id, is_single_holder_seat)
    references public.roles (id, is_single_holder_seat) on update cascade,

  -- The General Manager half of REQ-role-definition-and-permission-boundary:
  -- "single-holder restrictions follow the constitution, with General Manager
  -- additionally single-holder". Separate from
  -- `role_assignments_one_holder_per_office` on purpose — the predicates are
  -- disjoint (a seat cannot be both, by
  -- `roles_single_holder_seat_is_not_an_office`), so the two never overlap and
  -- a refusal names the authority that produced it.
  add constraint role_assignments_one_holder_per_single_holder_seat
    exclude using gist (
      role_id with =,
      daterange(effective_from, effective_to, '[)') with &&
    ) where (is_single_holder_seat);

comment on column public.role_assignments.is_single_holder_seat is
  'Denormalised from roles.is_single_holder_seat so the exclusion constraint above is expressible; the composite foreign key keeps the two in agreement.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- ADR 0010: revoke everything from the browser-facing roles, then grant back
-- only what the server path needs.
alter table public.role_groups enable row level security;

revoke all on table public.role_groups from anon, authenticated, service_role;
grant select on table public.role_groups to service_role;

-- REQ-static-role-catalogue: the catalogue "cannot be edited in the
-- application", and DEC-no-runtime-role-editing makes changing a role a
-- reviewed owner decision and a code change. Until now `roles` and
-- `role_aliases` granted the application role full write, which was harmless
-- while nothing wrote them and is not harmless now that operator
-- administration is being built on top of them. Read-only is the enforcement of
-- a decision, not a precaution: a defect in a future admin service cannot
-- rename a seat or invent one.
--
-- Migrations and the owner-run bootstrap reach the database as the owner, not
-- as `service_role`, so this does not stand between Brian and a reviewed
-- catalogue change.
revoke insert, update, delete on table public.roles, public.role_aliases from service_role;
