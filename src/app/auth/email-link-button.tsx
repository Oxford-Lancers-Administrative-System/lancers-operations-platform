import Button from "@mui/material/Button";
import AuthShell from "../auth-shell";

/**
 * The one screen an emailed one-time link renders on its GET — LAN-441.
 *
 * It exchanges nothing. The token travels in two hidden fields to a POST-only
 * Route Handler, so an email security scanner that pre-opens the link reads
 * this page and leaves the token unspent. A plain HTML form with a string
 * `action`: it works without JavaScript and never becomes a Server Action,
 * whose redirect semantics the exchange's fixed-origin rule was not written for.
 */
export function EmailLinkButton({
  label,
  exchangePath,
  tokenHash,
  type,
  testId,
}: {
  label: string;
  exchangePath: string;
  tokenHash: string;
  type: string;
  testId: string;
}) {
  return (
    <AuthShell heading={label}>
      <form method="post" action={exchangePath} data-testid={testId}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>
          {label}
        </Button>
      </form>
    </AuthShell>
  );
}

/** One query value as a string, or `null` for an absent or repeated one. */
export function singleQueryValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}
