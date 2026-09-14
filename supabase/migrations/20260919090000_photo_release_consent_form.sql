-- LAN-347 — the photo release step becomes the University's own consent form.
--
-- The form is its own record and it writes to no person fact (Brian,
-- 2026-09-14, decision 4, superseding the first draft of this issue): "nothing
-- in this form should change anything else… the only place this goes is into
-- the onboarding form with the information they put there. It's just a
-- record." So `people` gains nothing here, and everything the player types on
-- the consent form is stored beside the agreement it belongs to.
--
-- Three things, and nothing else:
--
--   1. The submitted form, on `onboarding_agreements`: `printed_name` plus
--      `form_name`, `form_address`, `form_postcode`, `form_tel` and
--      `form_email`. All text, all nullable — rows recorded under the
--      placeholder wording have none, and a recorded agreement is never
--      rewritten. Blank is refused on every one of them, so a recorded value is
--      always a value and "not given" is exactly null. Required-ness is a
--      service rule, not a `not null`: the wording decides, and the wording
--      lives in the version row. `form_*` rather than bare names because these
--      are what the person wrote on this form on this day, not facts about
--      them — the person record keeps its own name, phone and email, and a
--      different number here is simply what they wrote.
--
--      `printed_name` is the name typed under the tick. Not a signature and
--      never treated as one (decision 1; LAN-213 settled that a tick is the
--      model). It is the one box that is never prefilled.
--
--   2. `reopened_at` — LAN-240's reopen stops destroying the agreement.
--      Reopening the item (an operator setting it back off `complete`) used to
--      `delete` the row, which was schema-free and lost nothing while the row
--      held only version, moment and person. It now holds the form the player
--      submitted, and LAN-347 requires that a reopened form comes back with its
--      previous address and post code. A consent record is also the last thing
--      that should be destroyed by an operator's click. So the row is stamped
--      instead of deleted, the once-per-season rule becomes a partial unique
--      index over the live rows, and every reader of "what has this person
--      agreed to" ignores a stamped row exactly as it ignored a deleted one.
--
--   3. One new `onboarding_agreement_versions` row for `photo_release`,
--      carrying the University's wording verbatim — the consent form and its
--      Data Protection Privacy Notice. This is the slot LAN-214 built and
--      LAN-213 gated; the mechanism is unchanged, and the `placeholder-v1` row
--      stays exactly where it is because an agreement already recorded against
--      it must keep resolving to the words that were shown.
--
-- The body is plain text with `[[section]]` markers, one per block the page
-- renders. It is not JSON: the column is `text`, the wording is the artefact,
-- and a marker is the smallest thing that lets the page put a field where the
-- paper form has a box while leaving every printed word in the row rather than
-- in a component. `src/lib/services/onboarding-agreement-body.ts` is the one
-- reader; a body with no markers (the Code of Conduct's placeholder, until
-- LAN-282) is rendered as plain paragraphs, so nothing about this migration
-- changes that document.
--
-- The Activities and Purpose lines carry only their printed text, and the
-- form's three optional "insert any other…" lines stay empty — the club adds
-- nothing to the University's form (LAN-347 decision 2).
--
-- RLS is unchanged: `onboarding_agreements` already enables row level security
-- and a new column on an existing table inherits that table's privileges. The
-- one grant change is in section 2 and is narrower than what it replaces.

-- ---------------------------------------------------------------------------
-- 1. The submitted form, on the agreement
-- ---------------------------------------------------------------------------

alter table public.onboarding_agreements
  add column printed_name text,
  add column form_name text,
  add column form_address text,
  add column form_postcode text,
  add column form_tel text,
  add column form_email text;

alter table public.onboarding_agreements
  add constraint onboarding_agreements_printed_name_not_blank
    check (printed_name is null or btrim(printed_name) <> ''),
  add constraint onboarding_agreements_form_name_not_blank
    check (form_name is null or btrim(form_name) <> ''),
  add constraint onboarding_agreements_form_address_not_blank
    check (form_address is null or btrim(form_address) <> ''),
  add constraint onboarding_agreements_form_postcode_not_blank
    check (form_postcode is null or btrim(form_postcode) <> ''),
  add constraint onboarding_agreements_form_tel_not_blank
    check (form_tel is null or btrim(form_tel) <> ''),
  add constraint onboarding_agreements_form_email_not_blank
    check (form_email is null or btrim(form_email) <> '');

comment on column public.onboarding_agreements.printed_name is
  'The name the person typed under the tick, stored exactly as typed (LAN-347). Not a signature and never treated as one — the agreement is still version, moment and person. Never prefilled. Null on rows recorded before the form asked for it.';

comment on column public.onboarding_agreements.form_name is
  'The Name box of the submitted consent form, as typed (LAN-347). What this person wrote on this form, never a fact about them: the person record''s own name is untouched by a submission.';

comment on column public.onboarding_agreements.form_address is
  'The Address box of the submitted consent form, as typed (LAN-347). Multi-line free text, never parsed. Required for a new photo release; nothing on `people` holds a postal address.';

comment on column public.onboarding_agreements.form_postcode is
  'The Post code box of the submitted consent form, as typed (LAN-347). Deliberately unvalidated: a UK postcode rule would refuse the real overseas addresses the club already holds.';

comment on column public.onboarding_agreements.form_tel is
  'The Tel box of the submitted consent form, as typed (LAN-347). Stored as submitted, whatever it is, and never checked against or written to `contact_points`.';

comment on column public.onboarding_agreements.form_email is
  'The Email box of the submitted consent form, as typed (LAN-347). Stored as submitted, whatever it is, and never checked against or written to `contact_points`.';

-- ---------------------------------------------------------------------------
-- 2. A reopened agreement is stamped, not destroyed
-- ---------------------------------------------------------------------------
--
-- LAN-240 (walker M7, finding M7-01) made reopening an agreement item remove
-- the `onboarding_agreements` row, so the player's next load reads outstanding
-- rather than "Already agreed". That stays true, and everything that reads
-- agreements keeps reading none. What changes is that the row survives: it now
-- carries the form the player submitted, and LAN-347 requires a reopened form
-- to come back with its previous address and post code. Nothing else can
-- supply them, because nothing else stores them.
--
-- The once-per-season rule moves from a table constraint to a partial unique
-- index of the same name, over live rows only: a person may hold several
-- reopened photo releases for one season and at most one standing agreement.

alter table public.onboarding_agreements
  add column reopened_at timestamptz;

comment on column public.onboarding_agreements.reopened_at is
  'When an operator set this document back off complete (LAN-240''s reopen, LAN-347). A stamped row is no longer an agreement — every reader of "what has this person agreed to" ignores it — but it is kept, because it is the record of a consent that was given and of the form it was given on.';

alter table public.onboarding_agreements
  drop constraint onboarding_agreements_one_per_person_season_type;

create unique index onboarding_agreements_one_per_person_season_type
  on public.onboarding_agreements (person_id, season_id, agreement_type)
  where reopened_at is null;

-- Narrower than the `delete` this replaces, and narrower than a table-wide
-- update: the only column the application may ever change on a recorded
-- agreement is the stamp that retires it.
grant update (reopened_at) on table public.onboarding_agreements to service_role;

comment on table public.onboarding_agreements is
  'Version, moment, person and — since LAN-347 — the form they submitted. Never corrected in place: agreeing again in a later season is a new row, and reopening one stamps reopened_at rather than changing a word of what was agreed.';

-- ---------------------------------------------------------------------------
-- 3. The University's wording, in the versioned slot
-- ---------------------------------------------------------------------------
--
-- `effective_from` is computed from the versions already on record rather than
-- defaulted to `now()`: both rows are written by migrations, and a reset that
-- applies them inside one transaction would give them the same `now()`, making
-- "the current version" a coin toss. One second after the latest photo release
-- version there is, whenever that was, is unambiguous forever.

insert into public.onboarding_agreement_versions
  (agreement_type, version_label, body, effective_from)
values (
  'photo_release',
  'oxford-consent-form-v1',
  $body$[[heading]]
Photograph / filming / interview consent form
[[lead]]
This is a consent form for photos, film or voice recording for the activities below.
[[event]]
Event
[[event-note]]
and duration if applicable
[[date]]
Date
[[name]]
Name
[[consent-line]]
agrees that the University of Oxford can photograph, film or record the voice of (your name and/or children’s names):
[[consent-line-tail]]
(for whom you are the parent / guardian) at the event set out above.
[[address]]
Address
[[postcode]]
Post code:
[[tel]]
Tel:
[[email]]
Email:
[[activities-intro]]
You confirm that Oxford University can use your photo, film or voice recording for the following activities and purpose:
[[activities]]
The ‘Activities’
Posting online, storing, saving, uploading, copying, sharing on social media
[[purpose]]
The ‘Purpose’
Use for printed and online materials for Oxford University (including publications, reports, promotional material, websites and social media)
[[permissions]]
You confirm that Oxford University can:
- store copies of any photograph/recording for as long as necessary to fulfil the Purpose;
- store the photograph and your contact details in the University’s photographic libraries and databases; and
- store your contact details on its databases for the purpose of contacting you if necessary.
[[clauses]]
1. The University will process the photograph/recording and your contact details and any related personal data in accordance with the Data Protection Privacy Notice (see back for more details).
2. This consent form is governed by and construed in accordance with English law and the University and you submit to the exclusive jurisdiction of the English courts.
[[agree]]
I agree to the terms
[[print-name]]
Print name
[[print-name-tail]]
to confirm you have accepted and agreed (or parent/guardian’s name if the individual is under 13 years of age or is a vulnerable adult)
[[privacy]]
Data Protection Privacy Notice
In the course of completing this Consent Form, you have provided information about yourself (‘personal data’). We (the University of Oxford) are the ‘data controller’ for this information, which means we decide how to use it and are responsible for looking after it in accordance with the Data Protection Act 2018 and the General Data Protection Regulation as implemented into UK law and associated data protection legislation.
## How we use your data
We will use your data for the Purposes as set out in this Consent Form. We are processing your data for these purposes only because you have given us your consent to do so, by signing this Consent Form.
You can withdraw your consent at any time by contacting us at the address set out below. In this event, we will stop the processing as soon as we can. However, this will not affect the lawfulness of any processing carried out before your withdrawal of consent.
We will only use your data for the purposes for which we collected it, unless we reasonably consider that we need to use it for another related reason and that reason is compatible with the original purpose. If we need to use your data for an unrelated purpose, we will seek your consent to use it for that new purpose.
## Who has access to your data?
Access to your data within the University will be provided to those who need to view it as part of their work in carrying out the purposes described above.
We may share your data with companies who provide services to us, such as for printing, web hosting, asset and social media management, and, if applicable:
These companies are required to take appropriate security measures to protect your data in line with our policies. We do not allow them to use your data for their own purposes. We permit them to process your data only for specified purposes and in accordance with our instructions.
We may also share your data with the following organisations for the reasons indicated:
Where we share your data with a third party, we will seek to share the minimum amount necessary.
## Retaining your data
We will only retain your data for as long as we need it to meet our purposes, including any relating to legal, accounting, or reporting requirements.
## Security
Your data will be held securely in accordance with the University’s policies and procedures. Further information is available at www.ox.ac.uk/privacy-policy.
## Where we store and use your data
We store and use your data on University premises, in both a manual and electronic form.
Electronic data may be transferred to, and stored at, a destination outside the United Kingdom (UK), for example, when we communicate with you using a cloud based service provider that operates outside the UK such as Survey Monkey, MailChimp, Eventbrite, Wufoo, Facebook, Instagram, Twitter etc, and/or:
Such transfers will only take place if one of the following applies:
- the country receiving the data is considered by the UK to provide an adequate level of data protection;
- the organisation receiving the data is covered by an arrangement recognised by the UK as providing an adequate standard of data protection;
- the transfer is governed by approved contractual clauses;
- the transfer has your consent;
- the transfer is necessary for the performance of a contract with you or to take steps requested by you prior to entering into that contract; or
- the transfer is necessary for the performance of a contract with another person, which is in your interests.
## Your rights
You have the right to:
- request access to your data (commonly known as a “subject access request”). This enables you to receive a copy of your data and to check that we are lawfully processing it.
- request correction of your data. This enables you to ask us to correct any incomplete or inaccurate information we hold about you.
- request erasure of your data. This enables you to ask us to delete or remove your data where there is no good reason for us continuing to process it. You also have the right to ask us to delete or remove your data where you have exercised your right to object to processing (see below).
- object to the processing of your data, where we are processing it to meet our public tasks or legitimate interests (or the legitimate interests of a third party) and there is something about your particular situation which makes you want to object to processing on this ground. You also have the right to object where we are processing your data for direct marketing purposes.
- request that the processing of your data is restricted. This enables you to ask us to suspend the processing of your data, for example, if you want us to establish its accuracy or the reason for processing it.
- request the transfer of your data to another party
Further information on these rights is available from the Information Commissioner’s Office (https://ico.org.uk/for-organisations/guide-to-the-general-data-protection-regulation-gdpr/individual-rights/).
Depending on the circumstances and the nature of your request, it may not be possible for us to do what you have asked, for example, where there is a statutory or contractual requirement for us to process your data and it would not be possible to fulfil our legal obligations if we were to stop.
## Contact
If you wish to raise any queries or concerns about our use of your data, please contact us at:
[[privacy-contact]]
Oxford University Lancers American Football Club
american.football@sport.ox.ac.uk$body$,
  (select coalesce(max(effective_from), now()) + interval '1 second'
     from public.onboarding_agreement_versions
    where agreement_type = 'photo_release')
);
