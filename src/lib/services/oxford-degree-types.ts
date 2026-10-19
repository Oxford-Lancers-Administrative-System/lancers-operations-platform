/**
 * Degree type — LAN-494 (Brian, 2026-10-10). The kind of Oxford award a
 * student is reading for, held apart from the free-text Degree field (the
 * course or subject): "MSc" is a degree type, "MSc in Education" is a degree
 * field.
 *
 * The list is the University's own. The undergraduate and integrated master's
 * awards are clause 1 of the Examination Regulations' undergraduate award list
 * (https://examregs.admin.ox.ac.uk/Regulation?code=ronfm-p6obandfeeredu); the
 * graduate, research, certificate and higher awards are the regulation titles
 * at https://examregs.admin.ox.ac.uk/, checked on 2026-10-19 against the list
 * LAN-494 researched from the University style guide's academic-qualification
 * abbreviations
 * (https://www.ox.ac.uk/about/the-university/brand/style-guide/names-titles).
 * That check added two awards the issue's list did not name — the Certificate
 * of Higher Education and the Diploma in Legal Studies — and kept the Earth
 * Sciences department's own spelling, MEarthSci (the regulation writes
 * MEarthSc). Visiting is not an award:
 * a recognised or visiting student is affiliated with no Oxford degree in view.
 * Other covers anything the list misses, with its own free-text name.
 *
 * Each stored code is the abbreviation as Oxford writes it, so the column and
 * its audit trail read without a lookup. `people_degree_type_known` holds the
 * same list; `oxford-degree-types.test.ts` keeps the two in step.
 *
 * Pure and client-safe: the person record and its edit form both import it.
 */

export interface DegreeTypeOption {
  readonly value: string;
  readonly label: string;
  readonly group: string;
}

/** Abbreviation, then the full name the label pairs it with. `null` reads as the abbreviation alone. */
type Entry = readonly [code: string, name: string | null];

const GROUPS: readonly { readonly group: string; readonly entries: readonly Entry[] }[] = [
  {
    group: "Undergraduate",
    entries: [
      ["BA", "Bachelor of Arts"],
      ["BFA", "Bachelor of Fine Art"],
      ["BTh", "Bachelor of Theology"],
      ["BM BCh", "Bachelor of Medicine and Bachelor of Surgery"],
    ],
  },
  {
    group: "Integrated master's",
    entries: [
      ["MBiochem", "Master of Biochemistry"],
      ["MBiol", "Master of Biology"],
      ["MBiomedSci", "Master of Biomedical Sciences"],
      ["MChem", "Master of Chemistry"],
      ["MCompSci", "Master of Computer Science"],
      ["MCompPhil", "Master of Computer Science and Philosophy"],
      ["MEarthSci", "Master of Earth Sciences"],
      ["MEng", "Master of Engineering"],
      ["MMath", "Master of Mathematics"],
      ["MMathCompSci", "Master of Mathematics and Computer Science"],
      ["MMathPhil", "Master of Mathematics and Philosophy"],
      ["MMathPhys", "Master of Mathematical and Theoretical Physics"],
      ["MPhys", "Master of Physics"],
      ["MPhysPhil", "Master of Physics and Philosophy"],
      ["MSci", "Master of Science (integrated)"],
    ],
  },
  {
    group: "Postgraduate taught",
    entries: [
      ["MSt", "Master of Studies"],
      ["MSc", "Master of Science"],
      ["MPhil", "Master of Philosophy"],
      ["MBA", "Master of Business Administration"],
      ["EMBA", "Executive Master of Business Administration"],
      ["MFA", "Master of Fine Art"],
      ["MPP", "Master of Public Policy"],
      ["MTh", "Master of Theology"],
      ["BCL", "Bachelor of Civil Law"],
      ["BPhil", "Bachelor of Philosophy"],
      ["MJur", "Magister Juris"],
      ["PGDip", "Postgraduate Diploma"],
      ["PGCert", "Postgraduate Certificate"],
      ["PGCE", "Postgraduate Certificate in Education"],
    ],
  },
  {
    group: "Research",
    entries: [
      ["DPhil", "Doctor of Philosophy"],
      ["MSc by Research", null],
      ["DClinPsych", "Doctor of Clinical Psychology"],
    ],
  },
  {
    group: "Certificates, diplomas and non-degree study",
    entries: [
      ["UGCert", "Undergraduate Certificate"],
      ["UGDip", "Undergraduate Diploma"],
      ["UGAdvDip", "Undergraduate Advanced Diploma"],
      ["CertHE", "Certificate of Higher Education"],
      ["FCert", "Foundation Certificate"],
      ["Diploma in Legal Studies", null],
      ["Visiting", "Visiting or recognised student (non-degree)"],
    ],
  },
  {
    group: "Other Oxford awards",
    entries: [
      ["MA", "Master of Arts"],
      ["MLitt", "Master of Letters"],
      ["MCh", "Master of Surgery"],
      ["BSc", "Bachelor of Science"],
      ["BMus", "Bachelor of Music"],
      ["BD", "Bachelor of Divinity"],
      ["BLitt", "Bachelor of Letters"],
      ["DEng", "Doctor of Engineering"],
      ["DD", "Doctor of Divinity"],
      ["DCL", "Doctor of Civil Law"],
      ["DM", "Doctor of Medicine"],
      ["DLitt", "Doctor of Letters"],
      ["DSc", "Doctor of Science"],
      ["DMus", "Doctor of Music"],
    ],
  },
  { group: "Other", entries: [["Other", null]] },
];

/** The code that asks for a free-text name of its own (`people.degree_type_other`). */
export const DEGREE_TYPE_OTHER = "Other";

function labelOf([code, name]: Entry): string {
  if (code === "Visiting") return name ?? code;
  return name ? `${code} — ${name}` : code;
}

export const DEGREE_TYPE_OPTIONS: readonly DegreeTypeOption[] = Object.freeze(
  GROUPS.flatMap(({ group, entries }) =>
    entries.map((entry) => Object.freeze({ value: entry[0], label: labelOf(entry), group })),
  ),
);

export const DEGREE_TYPE_VALUES: readonly string[] = Object.freeze(
  DEGREE_TYPE_OPTIONS.map((option) => option.value),
);

const LABELS: ReadonlyMap<string, string> = new Map(
  DEGREE_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

export function isDegreeType(value: string): boolean {
  return LABELS.has(value);
}

/**
 * What the record shows: the label for a listed type, the typed name for
 * Other, `null` for no answer. An Other with no name yet reads as "Other".
 */
export function degreeTypeDisplay(
  degreeType: string | null | undefined,
  other: string | null | undefined,
): string | null {
  if (degreeType === null || degreeType === undefined || degreeType === "") return null;
  if (degreeType === DEGREE_TYPE_OTHER) return other ? `Other — ${other}` : DEGREE_TYPE_OTHER;
  return LABELS.get(degreeType) ?? degreeType;
}
