"use client";

import { useState } from "react";
import Stack from "@mui/material/Stack";
import { ListField, type ListOption } from "@/components/list-field";
import {
  COLLEGE_OPTIONS,
  DEGREE_LETTER_OPTIONS,
  isSubjectFor,
  subjectsForLetters,
} from "@/lib/services/oxford-academic";

export const COLLEGE_LABEL = "College";
export const DEGREE_LETTERS_LABEL = "Degree";
export const DEGREE_SUBJECT_LABEL = "Subject";

/** The subjects offered with these letters, as options; with no letters, every subject (LAN-512). */
export function subjectOptions(letters: string): ListOption[] {
  return subjectsForLetters(letters).map((subject) => ({ value: subject, label: subject }));
}

/** LAN-512 — the college, from the University's list only. */
export function CollegeField({
  name = "college",
  defaultValue = "",
  value,
  onChange,
  required,
  error,
  helperText,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  error?: string;
  helperText?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  return (
    <ListField
      name={name}
      label={COLLEGE_LABEL}
      options={COLLEGE_OPTIONS}
      value={current}
      onChange={(next) => {
        setOwn(next);
        onChange?.(next);
      }}
      required={required}
      error={error}
      helperText={helperText}
      testId="college-field"
    />
  );
}

/**
 * LAN-512 — the degree as two choices: the letters and the subject. With no
 * letters the subject lists every subject; once letters are chosen it narrows
 * to what the University offers with them, and choosing letters clears a
 * subject they do not offer (Brian's walk, 31 October).
 */
export function DegreeFields({
  lettersName = "degreeType",
  subjectName = "degreeField",
  defaultLetters = "",
  defaultSubject = "",
  required,
  lettersError,
  subjectError,
  onChange,
}: {
  lettersName?: string;
  subjectName?: string;
  defaultLetters?: string;
  defaultSubject?: string;
  required?: boolean;
  lettersError?: string;
  subjectError?: string;
  onChange?: (letters: string, subject: string) => void;
}) {
  const [letters, setLetters] = useState(defaultLetters);
  const [subject, setSubject] = useState(defaultSubject);
  return (
    <Stack spacing={2}>
      <ListField
        name={lettersName}
        label={DEGREE_LETTERS_LABEL}
        options={DEGREE_LETTER_OPTIONS}
        value={letters}
        onChange={(next) => {
          const keep = subject !== "" && isSubjectFor(next, subject);
          setLetters(next);
          if (!keep) setSubject("");
          onChange?.(next, keep ? subject : "");
        }}
        required={required}
        error={lettersError}
        testId="degree-letters-field"
      />
      <ListField
        name={subjectName}
        label={DEGREE_SUBJECT_LABEL}
        options={subjectOptions(letters)}
        value={subject}
        onChange={(next) => {
          setSubject(next);
          onChange?.(letters, next);
        }}
        required={required}
        error={subjectError}
        testId="degree-subject-field"
      />
    </Stack>
  );
}
