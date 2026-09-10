import type { ReactNode } from "react";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Typography from "@mui/material/Typography";

/**
 * One side of a two-value choice; omit `name` for a read-only comparison.
 *
 * LAN-256: controlled rather than uncontrolled, and there is deliberately no
 * `defaultSelected` any more. The merge comparison's radios used to carry
 * `defaultChecked` on the survivor's side of every row, which made "the
 * operator answered nothing" indistinguishable from "the operator chose the
 * survivor" — and the screen that has to know the difference is the one
 * deciding whether Merge may be pressed at all. A caller that renders a radio
 * therefore owns the answer.
 */
export function ValueChoice({
  name,
  value,
  text,
  checked,
  onSelect,
}: {
  name?: string;
  value: string;
  text: ReactNode;
  /** Required whenever `name` is given — nothing here is ever pre-selected for the operator. */
  checked?: boolean;
  onSelect?: (value: string) => void;
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
        // The answered side is visible as a side, not only as a dot.
        borderColor: checked ? "primary.main" : undefined,
      }}
    >
      {name ? (
        <Radio
          name={name}
          value={value}
          checked={checked ?? false}
          onChange={() => onSelect?.(value)}
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
