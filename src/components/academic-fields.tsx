"use client";

import { useState } from "react";
import Stack from "@mui/material/Stack";
import { ListField, type ListOption } from "@/components/list-field";
import {
  COLLEGE_OPTIONS,
  lettersForSubject,
  pairAfterLetters,
  pairAfterSubject,
  subjectsForLetters,
} from "@/lib/services/oxford-academic";

export const COLLEGE_LABEL = "College";
export const DEGREE_LETTERS_LABEL = "Degree";
export const DEGREE_SUBJECT_LABEL = "Subject";

/** The subjects offered with these letters, as options; with no letters, every subject (LAN-512). */
export function subjectOptions(letters: string): ListOption[] {
  return subjectsForLetters(letters).map((subject) => ({ value: subject, label: subject }));
}

/** The letters that offer this subject, as options; with no subject, every letter (LAN-512, 31 October). */
export function letterOptions(subject: string): ListOption[] {
  return [...lettersForSubject(subject)];
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
 * LAN-512 — the degree as two choices: the letters and the subject, each
 * narrowing the other (Brian's walks, 31 October). With neither chosen both
 * list everything; a choice with only one partner fills the partner in; a
 * Degree that does not offer the subject clears it. The rules live in
 * `pairAfterLetters` and `pairAfterSubject`, shared by every form.
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
  const [pair, setPair] = useState({ letters: defaultLetters, subject: defaultSubject });
  const { letters, subject } = pair;
  const choose = (next: { letters: string; subject: string }) => {
    setPair(next);
    onChange?.(next.letters, next.subject);
  };
  return (
    <Stack spacing={2}>
      <ListField
        name={lettersName}
        label={DEGREE_LETTERS_LABEL}
        options={letterOptions(subject)}
        value={letters}
        onChange={(next) => choose(pairAfterLetters(pair, next))}
        required={required}
        error={lettersError}
        testId="degree-letters-field"
      />
      <ListField
        name={subjectName}
        label={DEGREE_SUBJECT_LABEL}
        options={subjectOptions(letters)}
        value={subject}
        onChange={(next) => choose(pairAfterSubject(pair, next))}
        required={required}
        error={subjectError}
        testId="degree-subject-field"
      />
    </Stack>
  );
}
