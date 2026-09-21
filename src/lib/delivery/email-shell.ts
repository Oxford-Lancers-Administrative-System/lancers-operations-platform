/**
 * The shell every email the club sends is rendered into. LAN-398.
 *
 * ## What this changes and what it deliberately does not
 *
 * Until now the `html` part of an email was `lines.map(l => <p>escaped</p>)` and
 * nothing else: no head, no ground, no type, no mark. It arrived looking like a
 * machine had sent it, which is what a recipient decides about a club from. The
 * bar the club set (Brian, 2026-09-18) is its own university mailbox.
 *
 * So this wraps those same lines and changes not one of them. The copy is
 * `templates.ts`'s, the escaping is the same escaping, and each line is still
 * its own `<p>` — see that file on why the wording is not editorial: Meta's
 * classifier approved these exact bodies as Utility, and a reworded body is a
 * new submission and a new roll of the dice. Only the wrapper is new, and the
 * `text` part beside it is untouched byte for byte (`email-parts.test.ts`).
 *
 * ## Why it looks like this
 *
 * Email is not the web, and three constraints do most of the shaping:
 *
 *   * **Inline styles only.** Gmail strips `<style>` blocks in several of its
 *     clients and no client fetches an external sheet, so every rule is on the
 *     element. There is no stylesheet to keep in step with the application's,
 *     which is why the values below are written out of
 *     `docs/ux/design-system.md` with the token named beside each one.
 *   * **Tables for the frame.** Outlook on Windows draws HTML through Word,
 *     which has no `max-width` on a `div` and no reliable `vertical-align` on
 *     an inline-block. A centring table, a 600px column, and a two-cell table
 *     to sit the crest beside the club's name are the minimum that buys; there
 *     is no table anywhere the CSS alone would have held.
 *   * **A raster logo on an absolute HTTPS URL.** Word renders no SVG at all,
 *     and a mail client has no page to resolve a relative path against. The
 *     crest is `crest-email.png`, served from the application's own origin.
 *
 * `color-scheme: light` is there for the same family of reasons: Apple Mail and
 * Outlook will otherwise invert a light message in dark mode, and the crest is
 * Oxford Blue ink on transparency — inverted, it goes to navy on near-black.
 * Declaring the scheme is what stops a client guessing.
 *
 * ## The signature block, and where the Stop line goes
 *
 * Below the message: the crest again at 32px, the club's name written out in
 * full, and the privacy notice. It is the same information the `from` line
 * carries, said once more where a reader looks for it, and it is the only place
 * in the email with a link the template did not put there.
 *
 * `stopLine()` puts `Stop messages: <url>` last in the body of the four recruit
 * kinds that carry one, and nowhere else — LAN-372: a recruit may ask the club
 * to stop messaging them, and a roster player asking the same thing is asking
 * to leave the team, which is a membership conversation. That line is signature
 * material, so the shell renders that same paragraph — same wording, same
 * escaping, same `<p>` — in the signature block rather than in the message, and
 * nowhere twice. Nothing here decides *whether* it appears: the template did,
 * and this only reads what the template decided. The `text` part is unchanged
 * either way, and still carries the line exactly where it always did.
 */

/** Oxford Blue. `primary.main` — the club navy. */
const NAVY = "#002147";
/** Oxford Royal Blue. `primary.light` — the one link colour. */
const LINK = "#1D42A6";
/** Gold. `secondary.main` — "one accent band per page, a gold rule". */
const GOLD = "#C09723";
/** Oxford Charcoal. `text.primary` — all body text. */
const INK = "#211D1C";
/** Charcoal 70%. `text.secondary` — the signature block. */
const MUTED = "#5A5754";
/** Charcoal 12% over white. `divider`, resolved: Word has no `rgba()`. */
const RULE = "#E4E4E4";
/** Warm off-white / white. `background.default` and `background.paper`. */
const GROUND = "#F6F5F2";
const PAPER = "#FFFFFF";

/**
 * Geist first, then the faces a mail client actually has.
 *
 * Named, never fetched: a web font loaded from a third party in an email is a
 * request the recipient did not ask for, it is blocked in most clients anyway,
 * and `@import` is one of the first things a sanitiser strips. Geist renders
 * for the handful of readers who have it and everyone else lands on their
 * platform's UI face, which is what the club's own mail already looks like.
 */
const FACE =
  "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * `body1` — 15/22, 400. The application's body size, unchanged.
 *
 * `word-break` because several bodies end in a signed link printed in full, and
 * a token is one unbreakable word wider than a phone. Without it the column
 * stops being 600px and the message scrolls sideways.
 */
const BODY_TYPE = `font-family:${FACE};font-size:15px;line-height:22px;word-break:break-word;`;
/** `h2` — 22/28, 700. The club's name beside the crest. */
const NAME_TYPE = `font-family:${FACE};font-size:22px;line-height:28px;font-weight:700;`;
/** `body2` — 13/18, 400. The signature block, quieter than the message. */
const SIGN_TYPE = `font-family:${FACE};font-size:13px;line-height:18px;word-break:break-word;`;

/** The gap between paragraphs, matching the blank line the text part uses. */
const PARAGRAPH = 'style="margin:0 0 16px 0;"';

/** How the club's name is written beside the mark — `BrandMark`'s own wording. */
const CLUB_SHORT_NAME = "Oxford Lancers";
/** How it is written out in full, in the signature and in the `from` line. */
const CLUB_FULL_NAME = "Oxford University Lancers American Football Club";

/**
 * The mark's own proportions, 1017.75 × 860.5 in `crest.svg`'s units.
 *
 * Written out rather than left to the client: an `<img>` with no dimensions
 * reflows the whole header the moment the image loads, and Outlook sizes an
 * unmeasured image at its natural 114px.
 */
function crestWidthFor(height: number): number {
  return Math.round(height * (1017.75 / 860.5));
}

/**
 * The crest at `height`, or nothing at all when there is no origin to serve it
 * from.
 *
 * `srcset` offers the 1x rendition to a client that understands it; `src` is
 * the 2x, so a client that does not — Gmail, Outlook — still gets the sharp
 * one rather than a doubled 57px image.
 */
function crest(appBaseUrl: string, height: number, alt: string): string {
  if (appBaseUrl === "") return "";
  const width = crestWidthFor(height);
  const two = `${appBaseUrl}/brand/crest-email.png`;
  const one = `${appBaseUrl}/brand/crest-email@1x.png`;
  return (
    `<img src="${two}" srcset="${one} 1x, ${two} 2x" width="${width}" height="${height}" ` +
    `alt="${alt}" style="display:block;width:${width}px;height:${height}px;border:0;" />`
  );
}

/**
 * A crest and a line of text, side by side, in the two cells Word needs.
 *
 * With no crest the table is one cell wide and the text sits where it would
 * have, so the absence of a logo is not a hole in the layout.
 */
function beside(mark: string, text: string): string {
  const image = mark === "" ? "" : `<td style="padding-right:12px;">${mark}</td>`;
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0">',
    `<tr>${image}<td>${text}</td></tr>`,
    "</table>",
  ].join("");
}

/**
 * The same escaping the bare-`<p>` renderer did, moved here with the rendering.
 *
 * Bodies interpolate a venue, a name and a change summary that an operator
 * typed, and none of those is trusted markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface EmailShell {
  /** The application's public origin, or `""` for "no crest". */
  readonly appBaseUrl: string;
  /** The rendered subject, for the document title. */
  readonly subject: string;
  /** The template's body lines, in order, unchanged. */
  readonly lines: readonly string[];
  /** The line `stopLine()` put last, where it put one. Signed off with, not sent. */
  readonly stopLine: string | null;
}

/**
 * One email, rendered.
 *
 * 600px on a desktop client and fluid below it: the column is `width:100%` with
 * a `max-width`, so at 375px it is the viewport less the 16px gutter either
 * side, and nothing scrolls sideways.
 */
export function renderEmailHtml({ appBaseUrl, subject, lines, stopLine }: EmailShell): string {
  const paragraphs = lines
    .map((line) => `<p ${PARAGRAPH}>${escapeHtml(line)}</p>`)
    .join("\n        ");

  // The privacy notice is a link on the application's own origin, so it shares
  // the crest's fate when there is no origin to name: nothing relative goes
  // into an email, and the club's name is still signed.
  const signature = [
    beside(
      // Empty alt deliberately. The same mark, beside the same club name, a
      // second time in one message: a screen reader announcing "Oxford Lancers
      // crest" again is noise, not information.
      crest(appBaseUrl, 32, ""),
      `<span style="${SIGN_TYPE}color:${MUTED};">${CLUB_FULL_NAME}</span>`,
    ),
    ...(appBaseUrl === ""
      ? []
      : [
          `<p style="margin:12px 0 0 0;"><a href="${appBaseUrl}/privacy" style="color:${LINK};text-decoration:underline;">Privacy notice</a></p>`,
        ]),
    ...(stopLine === null ? [] : [`<p style="margin:12px 0 0 0;">${escapeHtml(stopLine)}</p>`]),
  ].join("\n        ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};color-scheme:light;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${GROUND};">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:${PAPER};border:1px solid ${RULE};border-radius:8px;">
        <tr>
          <td style="padding:24px 24px 16px 24px;border-bottom:2px solid ${GOLD};">
            ${beside(crest(appBaseUrl, 48, "Oxford Lancers crest"), `<span style="${NAME_TYPE}color:${NAVY};">${CLUB_SHORT_NAME}</span>`)}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;${BODY_TYPE}color:${INK};">
        ${paragraphs}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 24px 24px;border-top:1px solid ${RULE};${SIGN_TYPE}color:${MUTED};">
        ${signature}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}
