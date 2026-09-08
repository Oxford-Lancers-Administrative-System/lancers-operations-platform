import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The crest and the club's name, together — LAN-225, brief §4.4.
 *
 * `public/brand/crest.svg` is the white mark from Brian's supplied Group 315.svg
 * (see `public/brand/README.md`). The wordmark remains set in Geist.
 *
 * `tone` says which ground it sits on. On Oxford Blue the name is white; on
 * paper it is Oxford Blue. Nothing here is ever Gold text (2.73 on white).
 */
export const CREST_PATH = "/brand/crest.svg";
export const CLUB_NAME = "Oxford Lancers";

export function BrandMark({
  tone = "onDark",
  size = 32,
  crestSize = size,
  caption,
  testId,
}: {
  tone?: "onDark" | "onLight";
  /** The crest's height in pixels. The wordmark scales with it. */
  size?: 24 | 32 | 40 | 56;
  /** Display a detailed crest larger without enlarging the wordmark. */
  crestSize?: number;
  /** The line under the name: the section ("Operations"), or what the page is. */
  caption?: string;
  testId?: string;
}) {
  const nameColor = tone === "onDark" ? "common.white" : "primary.main";
  const captionColor = tone === "onDark" ? "#B9D6F2" : "text.secondary";
  const nameSize = size >= 40 ? 22 : size >= 32 ? 17 : 15;

  return (
    <Stack
      direction="row"
      spacing={size >= 40 ? 1.5 : 1.25}
      sx={{ alignItems: "center" }}
      data-testid={testId}
    >
      <Box
        component="img"
        src={tone === "onDark" ? CREST_PATH : "/brand/crest-blue.svg"}
        alt=""
        aria-hidden="true"
        sx={{ width: crestSize, height: crestSize, flexShrink: 0, display: "block" }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="p"
          sx={{
            color: nameColor,
            fontSize: nameSize,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {CLUB_NAME}
        </Typography>
        {caption ? (
          <Typography
            variant="overline"
            component="p"
            sx={{ color: captionColor, lineHeight: 1.4 }}
          >
            {caption}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}
