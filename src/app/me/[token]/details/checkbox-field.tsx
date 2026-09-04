"use client";

import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";

/**
 * The one interactive control this route's Server Components cannot host
 * directly — the same reason `src/app/a/[token]/multi-select-checkboxes.tsx`
 * is its own `"use client"` file rather than inline in `interest-questionnaire.tsx`:
 * a plain, uncontrolled MUI `Checkbox`/`FormControlLabel` pair, rendered from
 * an `async` Server Component with no client boundary of its own, throws
 * `TypeError: Cannot read properties of undefined (reading 'disabled')` on
 * this stack (Next 16, Turbopack, React 19, MUI 9) — reproduced consistently
 * against every checkbox on this route, and gone the moment the control is
 * hosted behind its own `"use client"` module. Uncontrolled and unstyled
 * beyond MUI's own defaults: this still posts through the page's ordinary
 * `<form action={...}>` server actions exactly as a bare `<input
 * type="checkbox">` would, via `FormData.get(name) === "1"`.
 */
export function CheckboxField({
  name,
  label,
  helperId,
}: {
  name: string;
  label: string;
  helperId?: string;
}) {
  return (
    <FormControlLabel
      control={<Checkbox name={name} value="1" aria-describedby={helperId} />}
      label={label}
    />
  );
}
