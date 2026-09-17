-- LAN-363 — a version of an agreement may be a PDF as well as text.
--
-- Brian, 2026-09-16: the club's Code of Conduct is a PDF, and the player
-- should read it as the document it is rather than as text somebody retyped.
-- The onboarding step renders it inline and keeps the existing text rendering
-- beside it as the accessible version, so an agreement always has wording in
-- the row and may also have a file.
--
-- One nullable column. `pdf_path` is a path this deployment serves — today
-- always something under `/documents/`, committed to the repository — not a
-- bucket key and not a URL: there is no storage bucket in this system and a
-- link to somewhere else is a document nobody can prove the contents of.
-- Blank is refused, so a recorded path is always a path and "no PDF" is
-- exactly null.
--
-- `body` stays `not null`. What the player agreed to is the wording in the
-- row; the PDF is how that wording is shown, never a substitute for holding
-- it. The tick is recorded against the version exactly as it was.
--
-- No RLS change: a new column on an existing table inherits that table's own
-- row level security and privileges.

alter table public.onboarding_agreement_versions
  add column pdf_path text;

alter table public.onboarding_agreement_versions
  add constraint onboarding_agreement_versions_pdf_path_not_blank
    check (pdf_path is null or btrim(pdf_path) <> ''),
  -- A path this deployment serves, never an address somewhere else. A single
  -- leading slash only: a second `/` is protocol-relative
  -- (`//host/file.pdf` resolves against the current protocol to an external
  -- host) and a second `\` is the same trick, since a browser normalises a
  -- leading backslash to a slash before resolving it.
  add constraint onboarding_agreement_versions_pdf_path_is_local
    check (
      pdf_path is null
      or (
        pdf_path like '/%'
        and substr(pdf_path, 2, 1) <> '/'
        and substr(pdf_path, 2, 1) <> '\'
      )
    );

comment on column public.onboarding_agreement_versions.pdf_path is
  'A path this deployment serves for the document itself (LAN-363), or null. The wording still lives in `body`; this is how it is shown.';
