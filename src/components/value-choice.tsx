import type { ReactNode } from "react";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Typography from "@mui/material/Typography";

/** A native, uncontrolled value choice; omit name for a read-only comparison. */
export function ValueChoice({
  name,
  value,
  text,
  defaultSelected,
}: {
  name?: string;
  value: string;
  text: ReactNode;
  defaultSelected?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      component="label"
      sx={{
        p: 1.5,
        minHeight: 44,
        minWidth: 0,
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: name ? "pointer" : "default",
      }}
    >
      {name ? (
        <Radio
          name={name}
          value={value}
          defaultChecked={defaultSelected}
          size="small"
          sx={{ p: 0 }}
        />
      ) : null}
      <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {text}
      </Typography>
    </Paper>
  );
}
