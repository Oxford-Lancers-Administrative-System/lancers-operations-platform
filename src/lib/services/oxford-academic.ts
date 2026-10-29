/**
 * College and degree as fixed lists — LAN-512 (Brian and Stewart, 29 October
 * 2026; replaces LAN-494's Degree type with Other). Pure and client-safe.
 *
 * **College** — the University's 39 constituent colleges and 5 permanent
 * private halls, names exactly as it writes them ("St" with no full stop, a
 * straight apostrophe, "Christ Church" with no "College"), plus Ripon College
 * Cuddesdon, which the graduate listing names as an external college (Brian,
 * 29 October: "leave everything that you found"). All Souls College is in.
 *   - https://www.ox.ac.uk/admissions/undergraduate/college-life/college-listing
 *   - https://www.ox.ac.uk/admissions/graduate/colleges/college-listing
 *   - https://www.ox.ac.uk/node/105915 ("39 colleges and 5 permanent private halls")
 *
 * **Degree** — two choices, the letters then the subject. The letters are the
 * University's award abbreviations (37 on offer), most common first; the
 * subject list is filtered to what the University offers with those letters,
 * so the pair (`people.degree_type`, `people.degree_field`) is the unit.
 *   - Undergraduate: the "Degree awarded" line of each page under
 *     https://www.ox.ac.uk/admissions/undergraduate/courses/undergraduate-course-listing-a-z
 *   - Graduate: the 410 course titles at
 *     https://www.ox.ac.uk/admissions/graduate/courses/find-your-course
 *   - Spellings: https://examregs.admin.ox.ac.uk/Regulation?code=ronfm-p6obandfeeredu
 *
 * Where the University names a course by the award alone, the subject is the
 * research's proposal (Brian, 29 October): MPP Public Policy, MBA Business
 * Administration, EMBA Business Administration (Executive), MFA Fine Art, BCL
 * Civil Law, MJur Law, DM Medicine, DClinPsych Clinical Psychology, BM BCh
 * Medicine. The 17 Centre for Doctoral Training and Doctoral Training
 * Partnership programmes are DPhil, subject the programme's name. BTh and
 * MMathPhys are in the Regulations with no current course page; their subject
 * is the award's own (Theology; Mathematical and Theoretical Physics). "MSc by
 * Research in X" is MSc, subject X. The four Foundation Year courses award no
 * letters and so are not offered.
 *
 * Validation is on input only: nothing in the database refuses a value that
 * is not in these lists, so a legacy free-text value stays readable until
 * LAN-513's cleanup fixes it.
 */
import {
  DEGREE_LETTER_ENTRIES,
  OXFORD_COLLEGES,
  OXFORD_EXTERNAL_COLLEGES,
  OXFORD_PERMANENT_PRIVATE_HALLS,
  SUBJECTS_BY_LETTERS,
} from "./oxford-academic-data";

export interface AcademicOption {
  readonly value: string;
  readonly label: string;
  readonly group: string;
}

export const COLLEGE_OPTIONS: readonly AcademicOption[] = Object.freeze([
  ...OXFORD_COLLEGES.map((value) => ({ value, label: value, group: "Colleges" })),
  ...OXFORD_PERMANENT_PRIVATE_HALLS.map((value) => ({
    value,
    label: value,
    group: "Permanent private halls",
  })),
  ...OXFORD_EXTERNAL_COLLEGES.map((value) => ({ value, label: value, group: "External colleges" })),
]);

/** How many of the letters lead the list as the usual ones, before the alphabetical rest. */
const COMMON_LETTERS = 6;

export const DEGREE_LETTER_OPTIONS: readonly AcademicOption[] = Object.freeze(
  DEGREE_LETTER_ENTRIES.map(([letters, name], index) => ({
    value: letters,
    label: `${letters} — ${name}`,
    group: index < COMMON_LETTERS ? "Most common" : "All degrees",
  })),
);

const COLLEGES = new Set(COLLEGE_OPTIONS.map((option) => option.value));
const LETTERS = new Map(DEGREE_LETTER_OPTIONS.map((option) => [option.value, option.label]));

export function isOxfordCollege(value: string): boolean {
  return COLLEGES.has(value);
}

function isDegreeLetters(value: string): boolean {
  return LETTERS.has(value);
}

/** The subjects offered with these letters; none for letters not in the list. */
export function subjectsForLetters(letters: string): readonly string[] {
  return SUBJECTS_BY_LETTERS[letters] ?? [];
}

export function isSubjectFor(letters: string, subject: string): boolean {
  return subjectsForLetters(letters).includes(subject);
}

/** What the record shows for the letters: the label for a listed one, the stored text otherwise. */
export function degreeLettersDisplay(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  return LETTERS.get(value) ?? value;
}

export const COLLEGE_NOT_LISTED = "Choose a college from the list.";
export const LETTERS_NOT_LISTED = "Choose the degree from the list.";
export const SUBJECT_NOT_LISTED = "Choose a subject from the list for this degree.";
export const SUBJECT_WITHOUT_LETTERS = "Choose the degree before the subject.";

/**
 * Every problem with a college and degree as entered, keyed by which of the
 * three it belongs to. Empty strings are no answer and are always allowed;
 * an answer must be in the lists, and a subject must be one offered with the
 * letters beside it.
 */
export function academicProblems(input: {
  readonly college?: string | null;
  readonly letters?: string | null;
  readonly subject?: string | null;
}): Partial<Record<"college" | "letters" | "subject", string>> {
  const problems: Partial<Record<"college" | "letters" | "subject", string>> = {};
  const college = (input.college ?? "").trim();
  const letters = (input.letters ?? "").trim();
  const subject = (input.subject ?? "").trim();
  if (college !== "" && !isOxfordCollege(college)) problems.college = COLLEGE_NOT_LISTED;
  if (letters !== "" && !isDegreeLetters(letters)) problems.letters = LETTERS_NOT_LISTED;
  if (subject !== "") {
    if (letters === "") problems.subject = SUBJECT_WITHOUT_LETTERS;
    else if (!problems.letters && !isSubjectFor(letters, subject)) {
      problems.subject = SUBJECT_NOT_LISTED;
    }
  }
  return problems;
}

/** Folds case, apostrophes, full stops and spacing, so an import's exact name still matches. */
function fold(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const COLLEGE_BY_FOLD = new Map(
  COLLEGE_OPTIONS.map((option) => [fold(option.value), option.value]),
);
const LETTERS_BY_FOLD = new Map(
  DEGREE_LETTER_OPTIONS.map((option) => [fold(option.value), option.value]),
);

/** The listed college a typed value names exactly (ignoring case and punctuation), or `null`. */
export function listedCollegeFor(value: string): string | null {
  return COLLEGE_BY_FOLD.get(fold(value)) ?? null;
}

/** The listed letters a typed value names exactly (ignoring case and punctuation), or `null`. */
export function listedLettersFor(value: string): string | null {
  return LETTERS_BY_FOLD.get(fold(value)) ?? null;
}

/** The listed subject for these letters a typed value names exactly, or `null`. */
export function listedSubjectFor(letters: string, value: string): string | null {
  const wanted = fold(value);
  return subjectsForLetters(letters).find((subject) => fold(subject) === wanted) ?? null;
}
