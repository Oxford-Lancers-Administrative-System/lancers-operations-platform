"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * A CSV import's possible-duplicate question for one row — the roster
 * import's (LAN-215, `W1-03`), lifted out unchanged so the recruit import
 * (LAN-487) asks it the same way. One form per row: "Same person" for a
 * candidate, or "Different person", each re-proposing the file with that
 * answer added. Everything it shows arrives already decided.
 */

interface ImportDuplicateCandidateView {
  readonly personId: string;
  readonly displayName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly matchedOn: readonly string[];
  /** The candidate's current-season standing, when the import shows one. */
  readonly standing?: string | null;
}

export interface ImportDuplicateQuestionProps {
  line: number;
  name: string;
  /** The row's own contact facts, already joined. */
  detail: string;
  candidates: readonly ImportDuplicateCandidateView[];
  formAction: (formData: FormData) => void;
  pending: boolean;
  csvText: string;
  fileName: string;
  duplicateAnswersJson: string;
}

export function ImportDuplicateQuestion({
  line,
  name,
  detail,
  candidates,
  formAction,
  pending,
  csvText,
  fileName,
  duplicateAnswersJson,
}: ImportDuplicateQuestionProps) {
  return (
    <Box
      component="form"
      action={formAction}
      sx={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "flex-start",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1.75,
      }}
      data-testid={`duplicate-${line}`}
    >
      <input type="hidden" name="intent" value="propose" />
      <input type="hidden" name="csvText" value={csvText} />
      <input type="hidden" name="fileName" value={fileName} />
      <input type="hidden" name="duplicateAnswersJson" value={duplicateAnswersJson} />
      <input type="hidden" name="answerLine" value={line} />

      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary" component="p">
          {`In the file, line ${line}`}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      </Box>

      <Stack spacing={1.5} sx={{ flex: "2 1 400px", minWidth: 0 }}>
        {candidates.map((candidate) => (
          <Box
            key={candidate.personId}
            sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", flexWrap: "wrap" }}
          >
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" component="p">
                Already on record
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {candidate.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[candidate.phone, candidate.email].filter((value) => value !== null).join(" · ")}
              </Typography>
              {candidate.standing ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid={`duplicate-standing-${line}-${candidate.personId}`}
                >
                  {candidate.standing}
                </Typography>
              ) : null}
              <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
                {`Matched on: ${candidate.matchedOn.join(", ")}`}
              </Typography>
            </Box>
            <Button
              type="submit"
              name="answerValue"
              value={candidate.personId}
              variant="contained"
              size="small"
              disabled={pending}
              data-testid={`same-person-${line}-${candidate.personId}`}
            >
              Same person
            </Button>
          </Box>
        ))}
        <Box>
          <Button
            type="submit"
            name="answerValue"
            value="different"
            variant="outlined"
            size="small"
            disabled={pending}
            data-testid={`different-person-${line}`}
          >
            Different person
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
