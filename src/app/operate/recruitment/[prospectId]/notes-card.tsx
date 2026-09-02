"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { RecruitmentProspectNote } from "@/lib/services/recruitment-prospect";
import { addRecruitmentNoteAction } from "./actions";

/** `W2`'s Notes card — prose, attributed and dated, with somewhere to write the next one. */
export default function NotesCard({
  prospectId,
  notes,
}: {
  prospectId: string;
  notes: readonly RecruitmentProspectNote[];
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addRecruitmentNoteAction({ prospectId, note: draft });
      setError(result.error);
      if (!result.error) setDraft("");
    });
  }

  return (
    <Box>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {notes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Not recorded
          </Typography>
        ) : (
          notes.map((note, index) => (
            <Box key={note.id}>
              {index > 0 ? <Divider sx={{ mb: 1.5 }} /> : null}
              <Typography variant="body2">{note.note}</Typography>
              <Typography variant="caption" color="text.secondary">
                {note.authorLabel} · {new Date(note.createdAt).toLocaleString()}
              </Typography>
            </Box>
          ))
        )}
      </Stack>
      <TextField
        fullWidth
        multiline
        minRows={2}
        placeholder="Add a note"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        data-testid="recruitment-note-draft"
      />
      {error ? (
        <Typography variant="caption" color="error" component="p" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      ) : null}
      <Button
        variant="outlined"
        size="small"
        sx={{ mt: 1, minHeight: 44 }}
        disabled={pending || draft.trim() === ""}
        onClick={submit}
        data-testid="recruitment-note-add"
      >
        Add note
      </Button>
    </Box>
  );
}
