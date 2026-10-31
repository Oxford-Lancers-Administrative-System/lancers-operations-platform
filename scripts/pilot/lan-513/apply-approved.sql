-- LAN-513 — apply the college, degree and subject changes Stewart approved.
--
-- Brian runs this by hand against hosted, after review-sheet.sql and Stewart's
-- answer. No agent runs it there. Read scripts/pilot/lan-513/README.md first.
--
-- DRY RUN BY DEFAULT. It ends with `rollback;`: run it once as it is and read
-- the preview. Only then change the last line to `commit;` and run it again.
--
-- It writes exactly the approved rows pasted below and nothing else: for each,
-- the columns whose approved value differs from the one on file, with one
-- audit row per column (the same action a correction on the person record
-- writes). It refuses the whole run, before any write, if a row names a person
-- who is not there (merged, erased or unknown), if anything on file has
-- changed since the sheet was taken, or if a value to write is not on
-- LAN-512's lists.

begin;

-- ---------------------------------------------------------------------------
-- Preflight: where this is running
-- ---------------------------------------------------------------------------
select current_database() as database, current_user as run_as, now() as started_at;

do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'people' and column_name = 'degree_type'
  ) or exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'people' and column_name = 'degree_type_other'
  ) then
    raise exception 'LAN-513: LAN-512''s migration is not applied here; wrong database or deploy first, stopping.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The approved rows: paste the approved_line values from the sheet here
-- ---------------------------------------------------------------------------
-- (person, college on file, degree on file, subject on file,
--  college to write, degree to write, subject to write)
-- Remove the trailing comma from the last line.

create temporary table lan513_approved (
  person_id uuid not null,
  was_college text,
  was_degree text,
  was_subject text,
  college text,
  degree text,
  subject text
) on commit drop;

insert into lan513_approved
  (person_id, was_college, was_degree, was_subject, college, degree, subject)
values
-- BEGIN APPROVED
-- END APPROVED
;

-- BEGIN LISTS (LAN-512's lists, src/lib/services/oxford-academic-data.ts; kept equal by
-- tests/lan-513-cleanup.test.ts)
create temporary table lan513_colleges (name text primary key) on commit drop;
insert into lan513_colleges (name) values
    ('All Souls College'),
    ('Balliol College'),
    ('Brasenose College'),
    ('Christ Church'),
    ('Corpus Christi College'),
    ('Exeter College'),
    ('Green Templeton College'),
    ('Harris Manchester College'),
    ('Hertford College'),
    ('Jesus College'),
    ('Keble College'),
    ('Kellogg College'),
    ('Lady Margaret Hall'),
    ('Linacre College'),
    ('Lincoln College'),
    ('Magdalen College'),
    ('Mansfield College'),
    ('Merton College'),
    ('New College'),
    ('Nuffield College'),
    ('Oriel College'),
    ('Pembroke College'),
    ('Reuben College'),
    ('St Anne''s College'),
    ('St Antony''s College'),
    ('St Catherine''s College'),
    ('St Cross College'),
    ('St Edmund Hall'),
    ('St Hilda''s College'),
    ('St Hugh''s College'),
    ('St John''s College'),
    ('St Peter''s College'),
    ('Somerville College'),
    ('The Queen''s College'),
    ('Trinity College'),
    ('University College'),
    ('Wadham College'),
    ('Wolfson College'),
    ('Worcester College'),
    ('Blackfriars'),
    ('Campion Hall'),
    ('Regent''s Park College'),
    ('St Stephen''s House'),
    ('Wycliffe Hall'),
    ('Ripon College Cuddesdon');

create temporary table lan513_college_variants (variant text not null, name text not null) on commit drop;
insert into lan513_college_variants (variant, name) values
    ('All Souls', 'All Souls College'),
    ('Alls Souls', 'All Souls College'),
    ('Balliol', 'Balliol College'),
    ('Balliol College Oxford', 'Balliol College'),
    ('BNC', 'Brasenose College'),
    ('Brasenose', 'Brasenose College'),
    ('Brazenose', 'Brasenose College'),
    ('Brazen Nose', 'Brasenose College'),
    ('Christchurch', 'Christ Church'),
    ('Christ church', 'Christ Church'),
    ('Christ Church College', 'Christ Church'),
    ('Ch Ch', 'Christ Church'),
    ('The House', 'Christ Church'),
    ('Corpus', 'Corpus Christi College'),
    ('Corpus Christi', 'Corpus Christi College'),
    ('Exeter', 'Exeter College'),
    ('GTC', 'Green Templeton College'),
    ('Green Templeton', 'Green Templeton College'),
    ('Templeton', 'Green Templeton College'),
    ('HMC', 'Harris Manchester College'),
    ('Harris Manchester', 'Harris Manchester College'),
    ('Manchester College', 'Harris Manchester College'),
    ('Hertford', 'Hertford College'),
    ('Hertford Oxford', 'Hertford College'),
    ('Jesus', 'Jesus College'),
    ('Keble', 'Keble College'),
    ('Kellogg', 'Kellogg College'),
    ('LMH', 'Lady Margaret Hall'),
    ('Lady Margaret', 'Lady Margaret Hall'),
    ('Lady Margaret Hall College', 'Lady Margaret Hall'),
    ('Linacre', 'Linacre College'),
    ('Lincoln', 'Lincoln College'),
    ('Magdalen', 'Magdalen College'),
    ('Magdalen College Oxford', 'Magdalen College'),
    ('Mansfield', 'Mansfield College'),
    ('Merton', 'Merton College'),
    ('New', 'New College'),
    ('New Coll', 'New College'),
    ('Nuffield', 'Nuffield College'),
    ('Oriel', 'Oriel College'),
    ('Pembroke', 'Pembroke College'),
    ('Reuben', 'Reuben College'),
    ('St. Anne''s', 'St Anne''s College'),
    ('St Annes', 'St Anne''s College'),
    ('St Anne', 'St Anne''s College'),
    ('Anne''s', 'St Anne''s College'),
    ('St. Antony''s', 'St Antony''s College'),
    ('St Antonys', 'St Antony''s College'),
    ('St Antony', 'St Antony''s College'),
    ('Antony''s', 'St Antony''s College'),
    ('St Catz', 'St Catherine''s College'),
    ('St. Catz', 'St Catherine''s College'),
    ('Catz', 'St Catherine''s College'),
    ('Catz College', 'St Catherine''s College'),
    ('St. Catherine''s', 'St Catherine''s College'),
    ('St Catherines', 'St Catherine''s College'),
    ('St Catherine', 'St Catherine''s College'),
    ('Saint Catherine''s', 'St Catherine''s College'),
    ('St Cats', 'St Catherine''s College'),
    ('St. Cross', 'St Cross College'),
    ('St Cross', 'St Cross College'),
    ('Teddy Hall', 'St Edmund Hall'),
    ('Ted Hall', 'St Edmund Hall'),
    ('Teddy', 'St Edmund Hall'),
    ('SEH', 'St Edmund Hall'),
    ('Edmund Hall', 'St Edmund Hall'),
    ('St. Edmund Hall', 'St Edmund Hall'),
    ('St Edmunds Hall', 'St Edmund Hall'),
    ('St. Hilda''s', 'St Hilda''s College'),
    ('St Hildas', 'St Hilda''s College'),
    ('Hilda''s', 'St Hilda''s College'),
    ('Hilda', 'St Hilda''s College'),
    ('St. Hugh''s', 'St Hugh''s College'),
    ('St Hughs', 'St Hugh''s College'),
    ('Hugh''s', 'St Hugh''s College'),
    ('St. John''s', 'St John''s College'),
    ('St Johns', 'St John''s College'),
    ('St john''s', 'St John''s College'),
    ('St John', 'St John''s College'),
    ('St. Peter''s', 'St Peter''s College'),
    ('St Peters', 'St Peter''s College'),
    ('Peter''s', 'St Peter''s College'),
    ('St Pete''s', 'St Peter''s College'),
    ('Somerville', 'Somerville College'),
    ('Queen''s', 'The Queen''s College'),
    ('Queens', 'The Queen''s College'),
    ('Queens College', 'The Queen''s College'),
    ('Queen''s College', 'The Queen''s College'),
    ('The Queens College', 'The Queen''s College'),
    ('Trinity', 'Trinity College'),
    ('Univ', 'University College'),
    ('Univ College', 'University College'),
    ('University Coll', 'University College'),
    ('Oxford University College', 'University College'),
    ('Wadham', 'Wadham College'),
    ('Wolfson', 'Wolfson College'),
    ('Worcester', 'Worcester College'),
    ('Worcester Oxford', 'Worcester College'),
    ('Blackfriars Hall', 'Blackfriars'),
    ('Blackfriars Oxford', 'Blackfriars'),
    ('Campion', 'Campion Hall'),
    ('Regent''s', 'Regent''s Park College'),
    ('Regents Park', 'Regent''s Park College'),
    ('Regent''s Park', 'Regent''s Park College'),
    ('Regents Park College', 'Regent''s Park College'),
    ('Regent''s Park Oxford', 'Regent''s Park College'),
    ('St. Stephen''s House', 'St Stephen''s House'),
    ('SSH', 'St Stephen''s House'),
    ('St Stephens House', 'St Stephen''s House'),
    ('Stephen''s House', 'St Stephen''s House'),
    ('Wycliffe', 'Wycliffe Hall'),
    ('Wycliff Hall', 'Wycliffe Hall'),
    ('Wyclif', 'Wycliffe Hall');

create temporary table lan513_letters (code text primary key) on commit drop;
insert into lan513_letters (code) values
    ('DPhil'),
    ('BA'),
    ('MSc'),
    ('MPhil'),
    ('MSt'),
    ('MBA'),
    ('BCL'),
    ('BFA'),
    ('BM BCh'),
    ('BPhil'),
    ('BTh'),
    ('DClinPsych'),
    ('DM'),
    ('EMBA'),
    ('MBiochem'),
    ('MBiol'),
    ('MBiomedSci'),
    ('MChem'),
    ('MCompPhil'),
    ('MCompSci'),
    ('MEarthSci'),
    ('MEng'),
    ('MFA'),
    ('MJur'),
    ('MMath'),
    ('MMathCompSci'),
    ('MMathPhil'),
    ('MMathPhys'),
    ('MPH'),
    ('MPhys'),
    ('MPhysPhil'),
    ('MPP'),
    ('MSci'),
    ('MTh'),
    ('PGCE'),
    ('PGCert'),
    ('PGDip');

create temporary table lan513_subjects (code text not null, subject text not null,
  primary key (code, subject)) on commit drop;
insert into lan513_subjects (code, subject) values
    ('DPhil', 'Ancient History'),
    ('DPhil', 'Anthropology'),
    ('DPhil', 'Archaeological Science'),
    ('DPhil', 'Archaeology (Oxford Lifelong Learning)'),
    ('DPhil', 'Archaeology (School of Archaeology)'),
    ('DPhil', 'Architectural History'),
    ('DPhil', 'Area Studies (Africa)'),
    ('DPhil', 'Area Studies (China)'),
    ('DPhil', 'Area Studies (Japan)'),
    ('DPhil', 'Area Studies (Latin America)'),
    ('DPhil', 'Area Studies (Middle East)'),
    ('DPhil', 'Area Studies (Russia and East Europe)'),
    ('DPhil', 'Area Studies (South Asia)'),
    ('DPhil', 'Asian and Middle Eastern Studies'),
    ('DPhil', 'Astrophysics'),
    ('DPhil', 'Atmospheric, Oceanic and Planetary Physics'),
    ('DPhil', 'Atomic and Laser Physics'),
    ('DPhil', 'Autonomous Intelligent Machines and Systems (EPSRC CDT)'),
    ('DPhil', 'Biochemistry'),
    ('DPhil', 'Biochemistry (Skaggs-Oxford Programme)'),
    ('DPhil', 'Biology'),
    ('DPhil', 'Biomedical Sciences (NIH OxCam)'),
    ('DPhil', 'Cancer Science (Clinician)'),
    ('DPhil', 'Cancer Science (Intercalation)'),
    ('DPhil', 'Cancer Science CDT (Biological background)'),
    ('DPhil', 'Cancer Science CDT (Maths/Physics background)'),
    ('DPhil', 'Cardiovascular Science (Cardiovascular Disease Prevention)'),
    ('DPhil', 'Cardiovascular Science (Technology, Artificial Intelligence and Data)'),
    ('DPhil', 'Cardiovascular Science (Vascular Contributions to Dementia)'),
    ('DPhil', 'Cardiovascular Science (VascularRewind)'),
    ('DPhil', 'Chemical Synthesis for a Healthy Planet (EPSRC CDT)'),
    ('DPhil', 'Chemistry'),
    ('DPhil', 'Classical Archaeology'),
    ('DPhil', 'Classical Languages and Literature'),
    ('DPhil', 'Clinical Epidemiology and Medical Statistics'),
    ('DPhil', 'Clinical Medicine'),
    ('DPhil', 'Clinical Neurosciences'),
    ('DPhil', 'Cognitive Behavioural Therapy'),
    ('DPhil', 'Computer Science'),
    ('DPhil', 'Condensed Matter Physics'),
    ('DPhil', 'Criminology'),
    ('DPhil', 'Earth Sciences'),
    ('DPhil', 'Economic and Social History'),
    ('DPhil', 'Economics'),
    ('DPhil', 'Education'),
    ('DPhil', 'ENAIBLE - Enabling Next-generation AI for a Bioscience Led Economy'),
    ('DPhil', 'Engineering Biology (EPSRC and BBSRC CDT)'),
    ('DPhil', 'Engineering Science'),
    ('DPhil', 'English'),
    ('DPhil', 'English Local History'),
    ('DPhil', 'Evidence-Based Health Care'),
    ('DPhil', 'Experimental Psychology'),
    ('DPhil', 'Finance'),
    ('DPhil', 'Fine Art (Contemporary Art History and Theory)'),
    ('DPhil', 'Fine Art (Practice-led)'),
    ('DPhil', 'Fusion Power (EPSRC CDT)'),
    ('DPhil', 'Generative Biology (EIT DTP)'),
    ('DPhil', 'Genomic Medicine and Statistics'),
    ('DPhil', 'Geography and the Environment'),
    ('DPhil', 'Healthcare Data Science (EPSRC CDT)'),
    ('DPhil', 'History'),
    ('DPhil', 'History of Art'),
    ('DPhil', 'Information, Communication and the Social Sciences'),
    ('DPhil', 'Inorganic Materials for Advanced Manufacturing (EPSRC CDT)'),
    ('DPhil', 'Intelligent Earth (UKRI CDT in AI for the Environment)'),
    ('DPhil', 'Interdisciplinary Life and Environmental Science'),
    ('DPhil', 'International Development'),
    ('DPhil', 'International Relations'),
    ('DPhil', 'Law'),
    ('DPhil', 'Linguistics, Philology and Phonetics'),
    ('DPhil', 'Literature and Arts'),
    ('DPhil', 'Management'),
    ('DPhil', 'Materials'),
    ('DPhil', 'Materials 4.0 (EPSRC CDT)'),
    ('DPhil', 'Mathematics'),
    ('DPhil', 'Medical Sciences'),
    ('DPhil', 'Medieval and Modern Languages'),
    ('DPhil', 'Migration Studies'),
    ('DPhil', 'Molecular and Cellular Medicine'),
    ('DPhil', 'Molecular Cell Biology in Health and Disease'),
    ('DPhil', 'Musculoskeletal Sciences'),
    ('DPhil', 'Music (Composition)'),
    ('DPhil', 'Music (Musicology)'),
    ('DPhil', 'Neuroscience (1+3)'),
    ('DPhil', 'Oncology'),
    ('DPhil', 'Paediatrics'),
    ('DPhil', 'Particle Physics'),
    ('DPhil', 'Pharmacology'),
    ('DPhil', 'Philosophy'),
    ('DPhil', 'Physiology, Anatomy and Genetics'),
    ('DPhil', 'Politics'),
    ('DPhil', 'Population Health'),
    ('DPhil', 'Primary Health Care'),
    ('DPhil', 'Psychiatry'),
    ('DPhil', 'Public Policy'),
    ('DPhil', 'Quantum Informatics (EPSRC CDT)'),
    ('DPhil', 'Robotics and Artificial Intelligence for Net Zero (EPSRC CDT)'),
    ('DPhil', 'Social Data Science'),
    ('DPhil', 'Social Intervention and Policy Evaluation'),
    ('DPhil', 'Social Policy'),
    ('DPhil', 'Socio-Legal Studies'),
    ('DPhil', 'Sociology'),
    ('DPhil', 'Statistics'),
    ('DPhil', 'Statistics and Machine Learning (EPSRC CDT)'),
    ('DPhil', 'Superconductivity: Enabling Transformative Technologies (EPSRC CDT)'),
    ('DPhil', 'Surgical Sciences'),
    ('DPhil', 'Sustainable Urban Development'),
    ('DPhil', 'Theology and Religion'),
    ('DPhil', 'Theoretical Physics'),
    ('DPhil', 'Transformative Technologies in Pharmaceutical Science (BBSRC CDT)'),
    ('DPhil', 'Translational Health Sciences'),
    ('DPhil', 'Women''s and Reproductive Health'),
    ('DPhil', 'Zero-Carbon Energy Research'),
    ('BA', 'Archaeology and Anthropology'),
    ('BA', 'Asian and Middle Eastern Studies'),
    ('BA', 'Biology'),
    ('BA', 'Biomedical Sciences'),
    ('BA', 'Classical Archaeology and Ancient History'),
    ('BA', 'Classics'),
    ('BA', 'Classics and Asian and Middle Eastern Studies'),
    ('BA', 'Classics and English'),
    ('BA', 'Classics and Modern Languages'),
    ('BA', 'Computer Science'),
    ('BA', 'Computer Science and Philosophy'),
    ('BA', 'Earth Sciences (Geology)'),
    ('BA', 'Economics and Management'),
    ('BA', 'English and Modern Languages'),
    ('BA', 'English Language and Literature'),
    ('BA', 'European and Middle Eastern Languages'),
    ('BA', 'Geography'),
    ('BA', 'History'),
    ('BA', 'History (Ancient and Modern)'),
    ('BA', 'History and Economics'),
    ('BA', 'History and English'),
    ('BA', 'History and Modern Languages'),
    ('BA', 'History and Politics'),
    ('BA', 'History of Art'),
    ('BA', 'Human Sciences'),
    ('BA', 'Law (Jurisprudence)'),
    ('BA', 'Mathematics / Mathematics and Statistics'),
    ('BA', 'Mathematics and Computer Science'),
    ('BA', 'Mathematics and Philosophy'),
    ('BA', 'Medicine'),
    ('BA', 'Modern Languages'),
    ('BA', 'Modern Languages and Linguistics'),
    ('BA', 'Music'),
    ('BA', 'Philosophy and Modern Languages'),
    ('BA', 'Philosophy and Theology'),
    ('BA', 'Philosophy, Politics and Economics (PPE)'),
    ('BA', 'Physics'),
    ('BA', 'Physics and Philosophy'),
    ('BA', 'Psychology (Experimental)'),
    ('BA', 'Psychology, Philosophy and Linguistics'),
    ('BA', 'Religion and Asian and Middle Eastern Studies'),
    ('BA', 'Theology and Religion'),
    ('MSc', 'Advanced Computer Science'),
    ('MSc', 'African Studies'),
    ('MSc', 'Applied Cancer Science'),
    ('MSc', 'Applied Digital Health'),
    ('MSc', 'Applied Financial Economics'),
    ('MSc', 'Applied Landscape Archaeology'),
    ('MSc', 'Applied Linguistics and Second Language Acquisition'),
    ('MSc', 'Applied Linguistics for Language Teaching'),
    ('MSc', 'Archaeological Science'),
    ('MSc', 'Archaeology'),
    ('MSc', 'Artificial Intelligence for Business'),
    ('MSc', 'Artificial Intelligence for Engineering Biology'),
    ('MSc', 'Autonomous Robotics'),
    ('MSc', 'Biochemistry'),
    ('MSc', 'Biodiversity, Conservation and Nature Recovery'),
    ('MSc', 'Biology'),
    ('MSc', 'Chemistry'),
    ('MSc', 'Clinical and Therapeutic Neuroscience'),
    ('MSc', 'Clinical Embryology'),
    ('MSc', 'Clinical Neurosciences'),
    ('MSc', 'Clinical Trials'),
    ('MSc', 'Cognitive Behavioural Therapy (Clinical)'),
    ('MSc', 'Cognitive Behavioural Therapy (Research)'),
    ('MSc', 'Comparative Social Policy'),
    ('MSc', 'Contemporary Chinese Studies'),
    ('MSc', 'Criminology and Criminal Justice'),
    ('MSc', 'Digital Scholarship'),
    ('MSc', 'Earth Sciences'),
    ('MSc', 'Economic and Social History'),
    ('MSc', 'Economics for Development'),
    ('MSc', 'Education (Child Development and Education)'),
    ('MSc', 'Education (Comparative and International Education)'),
    ('MSc', 'Education (Digital and Social Change)'),
    ('MSc', 'Education (Higher Education)'),
    ('MSc', 'Education (Research Design and Methodology)'),
    ('MSc', 'Educational Assessment'),
    ('MSc', 'Energy Systems'),
    ('MSc', 'Engineering Science'),
    ('MSc', 'English Local History'),
    ('MSc', 'Environmental Change and Policy'),
    ('MSc', 'Evidence-Based Health Care'),
    ('MSc', 'Evidence-Based Health Care (Medical Statistics)'),
    ('MSc', 'Evidence-Based Social Intervention and Policy Evaluation'),
    ('MSc', 'Experimental and Translational Therapeutics'),
    ('MSc', 'Experimental Psychology'),
    ('MSc', 'Financial Economics'),
    ('MSc', 'Genomic Medicine'),
    ('MSc', 'Global Governance and Diplomacy'),
    ('MSc', 'Global Health Science and Epidemiology'),
    ('MSc', 'Global Healthcare Leadership'),
    ('MSc', 'Global Women''s Health'),
    ('MSc', 'Health Service Improvement and Evaluation'),
    ('MSc', 'History of Science, Medicine and Technology'),
    ('MSc', 'Integrated Immunology'),
    ('MSc', 'Intellectual Property'),
    ('MSc', 'International Health and Tropical Medicine'),
    ('MSc', 'International Human Rights Law'),
    ('MSc', 'Japanese Studies'),
    ('MSc', 'Latin American Studies'),
    ('MSc', 'Law and Finance'),
    ('MSc', 'Law, Governance and Artificial Intelligence'),
    ('MSc', 'Learning and Teaching'),
    ('MSc', 'Major Programme Management'),
    ('MSc', 'Materials'),
    ('MSc', 'Mathematical and Computational Finance'),
    ('MSc', 'Mathematical and Theoretical Physics'),
    ('MSc', 'Mathematical Modelling and Scientific Computing'),
    ('MSc', 'Mathematical Sciences'),
    ('MSc', 'Mathematics'),
    ('MSc', 'Mathematics and Foundations of Computer Science'),
    ('MSc', 'Medical Anthropology'),
    ('MSc', 'Medical Education'),
    ('MSc', 'Medical Physics with Radiobiology'),
    ('MSc', 'Medical Sciences'),
    ('MSc', 'Migration Studies'),
    ('MSc', 'Modelling for Global Health'),
    ('MSc', 'Modern Middle Eastern Studies'),
    ('MSc', 'Modern South Asian Studies'),
    ('MSc', 'Molecular and Cellular Medicine'),
    ('MSc', 'Musculoskeletal Sciences'),
    ('MSc', 'Nanotechnology for Medicine and Health Care'),
    ('MSc', 'Nature, Society and Environmental Governance'),
    ('MSc', 'Neuroscience'),
    ('MSc', 'Oncology'),
    ('MSc', 'Paediatric Infectious Diseases'),
    ('MSc', 'Paediatrics'),
    ('MSc', 'Pain Neurosciences'),
    ('MSc', 'Pharmacology'),
    ('MSc', 'Pharmacology: Science with Innovation'),
    ('MSc', 'Physiology, Anatomy and Genetics'),
    ('MSc', 'Politics of Global Challenges'),
    ('MSc', 'Precision Cancer Medicine'),
    ('MSc', 'Psychiatry'),
    ('MSc', 'Public Policy Research'),
    ('MSc', 'Quantum Technologies'),
    ('MSc', 'Radiobiology'),
    ('MSc', 'Refugee and Forced Migration Studies'),
    ('MSc', 'Reproductive Genetics'),
    ('MSc', 'Russian and East European Studies'),
    ('MSc', 'Sleep Medicine'),
    ('MSc', 'Social Anthropology'),
    ('MSc', 'Social Data Science'),
    ('MSc', 'Social Science of the Internet'),
    ('MSc', 'Sociology'),
    ('MSc', 'Software and Systems Security'),
    ('MSc', 'Software Engineering'),
    ('MSc', 'Statistical Science'),
    ('MSc', 'Statistics'),
    ('MSc', 'Surgical Science and Practice'),
    ('MSc', 'Surgical Sciences'),
    ('MSc', 'Sustainability, Enterprise and the Environment'),
    ('MSc', 'Sustainable Urban Development'),
    ('MSc', 'Taxation'),
    ('MSc', 'Teacher Education'),
    ('MSc', 'Theoretical and Computational Chemistry'),
    ('MSc', 'Translational Health Sciences'),
    ('MSc', 'Visual, Material and Museum Anthropology'),
    ('MSc', 'Water Science, Policy and Management'),
    ('MSc', 'Women''s and Reproductive Health'),
    ('MPhil', 'Ancient History'),
    ('MPhil', 'Buddhist Studies'),
    ('MPhil', 'Celtic Studies'),
    ('MPhil', 'Classical Archaeology'),
    ('MPhil', 'Classical Indian Religion'),
    ('MPhil', 'Comparative Social Policy'),
    ('MPhil', 'Cuneiform Studies'),
    ('MPhil', 'Development Studies'),
    ('MPhil', 'Eastern Christian Studies'),
    ('MPhil', 'Economic and Social History'),
    ('MPhil', 'Economics'),
    ('MPhil', 'Egyptology'),
    ('MPhil', 'English Studies (Medieval Period)'),
    ('MPhil', 'Evidence-Based Social Intervention and Policy Evaluation'),
    ('MPhil', 'Global and Area Studies'),
    ('MPhil', 'Greek and/or Latin Languages and Literature'),
    ('MPhil', 'History (British and European History 1700-1850)'),
    ('MPhil', 'History (Early Modern History 1500-1700)'),
    ('MPhil', 'History (History of War)'),
    ('MPhil', 'History (Intellectual History)'),
    ('MPhil', 'History (Medieval History)'),
    ('MPhil', 'History (Modern British History 1850-present)'),
    ('MPhil', 'History (Modern European History 1850-present)'),
    ('MPhil', 'History (US History)'),
    ('MPhil', 'History (Women''s, Gender and Queer History)'),
    ('MPhil', 'History of Science, Medicine and Technology'),
    ('MPhil', 'International Relations'),
    ('MPhil', 'Islamic Art and Architecture'),
    ('MPhil', 'Islamic Studies and History'),
    ('MPhil', 'Japanese Studies'),
    ('MPhil', 'Jewish Studies'),
    ('MPhil', 'Jewish Studies in the Graeco-Roman Period'),
    ('MPhil', 'Judaism and Christianity in the Graeco-Roman World'),
    ('MPhil', 'Late Antique and Byzantine Studies'),
    ('MPhil', 'Latin American Studies'),
    ('MPhil', 'Law'),
    ('MPhil', 'Linguistics, Philology and Phonetics'),
    ('MPhil', 'Medical Anthropology'),
    ('MPhil', 'Modern Chinese Studies'),
    ('MPhil', 'Modern Languages'),
    ('MPhil', 'Modern Middle Eastern Studies'),
    ('MPhil', 'Music (Composition)'),
    ('MPhil', 'Music (Musicology)'),
    ('MPhil', 'Music (Performance)'),
    ('MPhil', 'Philosophical Theology'),
    ('MPhil', 'Politics (Comparative Government)'),
    ('MPhil', 'Politics (European Politics and Society)'),
    ('MPhil', 'Politics (Political Theory)'),
    ('MPhil', 'Russian and East European Studies'),
    ('MPhil', 'Slavonic Studies'),
    ('MPhil', 'Social Anthropology'),
    ('MPhil', 'Socio-Legal Research'),
    ('MPhil', 'Sociology and Demography'),
    ('MPhil', 'Theology'),
    ('MPhil', 'Tibetan and Himalayan Studies'),
    ('MPhil', 'Traditional East Asia'),
    ('MPhil', 'Visual, Material and Museum Anthropology'),
    ('MSt', 'Ancient History'),
    ('MSt', 'Ancient Philosophy'),
    ('MSt', 'Asian and Middle Eastern Studies'),
    ('MSt', 'Bible Interpretation'),
    ('MSt', 'Celtic Studies'),
    ('MSt', 'Classical Archaeology'),
    ('MSt', 'Classical Hebrew Studies'),
    ('MSt', 'Comparative Literature and Critical Translation'),
    ('MSt', 'Contemporary Art History and Theory'),
    ('MSt', 'Creative Translation'),
    ('MSt', 'Creative Writing'),
    ('MSt', 'Diplomatic Studies'),
    ('MSt', 'English (1550-1700)'),
    ('MSt', 'English (1700-1830)'),
    ('MSt', 'English (1830-1914)'),
    ('MSt', 'English (1900-present)'),
    ('MSt', 'English (650-1550)'),
    ('MSt', 'English and American Studies'),
    ('MSt', 'Film Aesthetics'),
    ('MSt', 'Global and Imperial History'),
    ('MSt', 'Greek and/or Latin Languages and Literature'),
    ('MSt', 'Historical Studies'),
    ('MSt', 'Histories and Cultures of Colonisation'),
    ('MSt', 'History (British and European History 1700-1850)'),
    ('MSt', 'History (Early Modern History 1500-1700)'),
    ('MSt', 'History (History of War)'),
    ('MSt', 'History (Intellectual History)'),
    ('MSt', 'History (Medieval History)'),
    ('MSt', 'History (Modern British History 1850-present)'),
    ('MSt', 'History (Modern European History 1850-Present)'),
    ('MSt', 'History (US History)'),
    ('MSt', 'History (Women''s, Gender and Queer History)'),
    ('MSt', 'History of Art and Visual Culture'),
    ('MSt', 'History of Design'),
    ('MSt', 'Islamic Art and Architecture'),
    ('MSt', 'Islamic Studies and History'),
    ('MSt', 'Jewish Studies'),
    ('MSt', 'Jewish Studies in the Graeco-Roman Period'),
    ('MSt', 'Korean Studies'),
    ('MSt', 'Late Antique and Byzantine Studies'),
    ('MSt', 'Linguistics, Philology and Phonetics (Advanced Study)'),
    ('MSt', 'Linguistics, Philology and Phonetics (Research Preparation)'),
    ('MSt', 'Literature and Arts'),
    ('MSt', 'Medieval Studies'),
    ('MSt', 'Mindfulness-Based Cognitive Therapy'),
    ('MSt', 'Modern Languages'),
    ('MSt', 'Music (Composition)'),
    ('MSt', 'Music (Musicology)'),
    ('MSt', 'Music (Performance)'),
    ('MSt', 'Philosophical Theology'),
    ('MSt', 'Philosophy of Physics'),
    ('MSt', 'Practical Ethics'),
    ('MSt', 'Psychodynamic Practice'),
    ('MSt', 'Slavonic Studies'),
    ('MSt', 'Study of Religions'),
    ('MSt', 'Syriac Studies'),
    ('MSt', 'Theology'),
    ('MSt', 'Traditional China'),
    ('MSt', 'Women''s, Gender, and Sexuality Studies'),
    ('MSt', 'World Literatures in English'),
    ('MSt', 'Yiddish Studies'),
    ('MBA', 'Business Administration'),
    ('BCL', 'Civil Law'),
    ('BFA', 'Fine Art'),
    ('BM BCh', 'Medicine'),
    ('BM BCh', 'Medicine (graduate entry)'),
    ('BPhil', 'Philosophy'),
    ('BTh', 'Theology'),
    ('DClinPsych', 'Clinical Psychology'),
    ('DM', 'Medicine'),
    ('EMBA', 'Business Administration (Executive)'),
    ('MBiochem', 'Biochemistry (Molecular and Cellular)'),
    ('MBiol', 'Biology'),
    ('MBiomedSci', 'Biomedical Sciences'),
    ('MChem', 'Chemistry'),
    ('MCompPhil', 'Computer Science and Philosophy'),
    ('MCompSci', 'Computer Science'),
    ('MEarthSci', 'Earth Sciences (Geology)'),
    ('MEng', 'Engineering Science'),
    ('MEng', 'Materials Science'),
    ('MFA', 'Fine Art'),
    ('MJur', 'Law'),
    ('MMath', 'Mathematics / Mathematics and Statistics'),
    ('MMathCompSci', 'Mathematics and Computer Science'),
    ('MMathPhil', 'Mathematics and Philosophy'),
    ('MMathPhys', 'Mathematical and Theoretical Physics'),
    ('MPH', 'Public Health Research'),
    ('MPhys', 'Physics'),
    ('MPhysPhil', 'Physics and Philosophy'),
    ('MPP', 'Public Policy'),
    ('MSci', 'Psychology (Experimental)'),
    ('MSci', 'Psychology, Philosophy and Linguistics'),
    ('MTh', 'Applied Theology'),
    ('PGCE', 'Biology'),
    ('PGCE', 'Chemistry'),
    ('PGCE', 'English'),
    ('PGCE', 'Geography'),
    ('PGCE', 'History'),
    ('PGCE', 'Mandarin'),
    ('PGCE', 'Mathematics'),
    ('PGCE', 'Modern Languages'),
    ('PGCE', 'Physics'),
    ('PGCert', 'Architectural History'),
    ('PGCert', 'Cognitive Behavioural Therapy'),
    ('PGCert', 'Ecological Survey Techniques'),
    ('PGCert', 'Enhanced Cognitive Behavioural Therapy (Psychological Trauma and Personality Development)'),
    ('PGCert', 'Enhanced Cognitive Behavioural Therapy (Psychosis and Bipolar)'),
    ('PGCert', 'Health Research'),
    ('PGCert', 'Healthcare Systems Safety'),
    ('PGCert', 'Historical Studies'),
    ('PGCert', 'Nanotechnology'),
    ('PGCert', 'Paediatric Infectious Diseases'),
    ('PGCert', 'Patient Safety and Quality Improvement'),
    ('PGCert', 'Psychodynamic Counselling'),
    ('PGCert', 'Qualitative Health Research Methods'),
    ('PGCert', 'Statistics and Epidemiology'),
    ('PGDip', 'Applied Theology'),
    ('PGDip', 'Artificial Intelligence for Business'),
    ('PGDip', 'Artificial Intelligence in Education'),
    ('PGDip', 'Cognitive Behavioural Therapy'),
    ('PGDip', 'Cognitive Behavioural Therapy (Severe Mental Health Problems)'),
    ('PGDip', 'Early Childhood Education'),
    ('PGDip', 'English as an Additional Language'),
    ('PGDip', 'Financial Strategy'),
    ('PGDip', 'Global Business'),
    ('PGDip', 'Global Health Research'),
    ('PGDip', 'Health Research'),
    ('PGDip', 'Healthcare Systems Safety'),
    ('PGDip', 'Intellectual Property Law and Practice'),
    ('PGDip', 'Learning and Teaching Mandarin'),
    ('PGDip', 'Organisational Leadership'),
    ('PGDip', 'Paediatric Infectious Diseases'),
    ('PGDip', 'Sleep Medicine'),
    ('PGDip', 'Statistical Science'),
    ('PGDip', 'Strategy and Innovation'),
    ('PGDip', 'Theology and Religion'),
    ('PGDip', 'Wildlife Conservation (Recanati-Kaplan)');
-- END LISTS

-- ---------------------------------------------------------------------------
-- Refuse the whole run, before any write, on anything unexpected
-- ---------------------------------------------------------------------------
do $checks$
declare
  problem text;
begin
  select string_agg(format('%s: %s', person_id, reason), '; ' order by person_id::text)
    into problem
    from (
      select a.person_id, 'listed twice' as reason
        from lan513_approved a
       group by a.person_id
      having count(*) > 1
      union all
      select a.person_id, 'no such person, or merged or erased since the sheet'
        from lan513_approved a
        left join public.people p
          on p.id = a.person_id and p.merged_into_person_id is null and p.erased_at is null
       where p.id is null
      union all
      select a.person_id, 'changed since the sheet was taken'
        from lan513_approved a
        join public.people p on p.id = a.person_id
       where p.college is distinct from a.was_college
          or p.degree_type is distinct from a.was_degree
          or p.degree_field is distinct from a.was_subject
      union all
      select a.person_id, format('college "%s" is not on the list', a.college)
        from lan513_approved a
       where a.college is distinct from a.was_college
         and (a.college is null or not exists (select 1 from lan513_colleges c where c.name = a.college))
      union all
      select a.person_id, format('degree "%s" is not on the list', a.degree)
        from lan513_approved a
       where a.degree is distinct from a.was_degree
         and (a.degree is null or not exists (select 1 from lan513_letters l where l.code = a.degree))
      union all
      select a.person_id, format('"%s" is not a subject offered with %s', a.subject, a.degree)
        from lan513_approved a
       where a.subject is distinct from a.was_subject
         and a.subject is not null
         and not exists (
           select 1 from lan513_subjects s where s.code = a.degree and s.subject = a.subject)
      union all
      select a.person_id, 'a subject cannot be cleared here'
        from lan513_approved a
       where a.subject is null and a.was_subject is not null
    ) problems;
  if problem is not null then
    raise exception 'LAN-513: nothing written. %', problem;
  end if;
end
$checks$;

-- ---------------------------------------------------------------------------
-- Preview: every change this run makes, before it makes it. Keep this output:
-- it is the record of the change, and it names people, so it stays out of the
-- repository.
-- ---------------------------------------------------------------------------
create temporary table lan513_changes on commit drop as
select a.person_id, 'college' as field, a.was_college as from_value, a.college as to_value
  from lan513_approved a where a.college is distinct from a.was_college
union all
select a.person_id, 'degree_type', a.was_degree, a.degree
  from lan513_approved a where a.degree is distinct from a.was_degree
union all
select a.person_id, 'degree_field', a.was_subject, a.subject
  from lan513_approved a where a.subject is distinct from a.was_subject;

select c.person_id,
       btrim(p.given_name || ' ' || coalesce(p.family_name, '')) as name,
       c.field,
       c.from_value,
       c.to_value
  from lan513_changes c
  join public.people p on p.id = c.person_id
 order by name, c.person_id, c.field;

-- ---------------------------------------------------------------------------
-- The writes, and their audit rows
-- ---------------------------------------------------------------------------
update public.people p
   set college = a.college,
       degree_type = a.degree,
       degree_field = a.subject,
       updated_at = now()
  from lan513_approved a
 where p.id = a.person_id
   and (a.college is distinct from a.was_college
        or a.degree is distinct from a.was_degree
        or a.subject is distinct from a.was_subject);

insert into public.audit_events
  (actor_label, action, entity_table, entity_id, from_state, to_state, reason, context)
select 'owner: LAN-513 college and degree cleanup',
       'person_' || c.field || '_updated',
       'people',
       c.person_id,
       c.from_value,
       c.to_value,
       'LAN-513: moved onto the University''s list, as approved by the club.',
       jsonb_build_object('issue', 'LAN-513', 'field', c.field)
  from lan513_changes c;

-- ---------------------------------------------------------------------------
-- Verification: what was written, read back
-- ---------------------------------------------------------------------------
select count(distinct c.person_id) as people_changed,
       count(*) filter (where c.field = 'college') as colleges_changed,
       count(*) filter (where c.field = 'degree_type') as degrees_changed,
       count(*) filter (where c.field = 'degree_field') as subjects_changed,
       count(*) filter (
         where (c.field = 'college' and p.college is distinct from c.to_value)
            or (c.field = 'degree_type' and p.degree_type is distinct from c.to_value)
            or (c.field = 'degree_field' and p.degree_field is distinct from c.to_value)
       ) as not_as_approved
  from lan513_changes c
  join public.people p on p.id = c.person_id;

-- DRY RUN. Change this line to `commit;` once the preview above is right.
rollback;
