import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { AgreementBodyBlock } from "@/lib/services/onboarding-agreement-body";

/**
 * Printed text from a versioned agreement's body — LAN-347. One component for
 * both documents, so the Code of Conduct's placeholder and the University's
 * consent form are rendered by the same code and neither carries wording of
 * its own. Shapes come from the row (`onboarding-agreement-body.ts`); this
 * decides only what a subheading, a bullet and a numbered clause look like.
 */
export function AgreementBlocks({
  blocks,
  testId,
}: {
  blocks: readonly AgreementBodyBlock[];
  testId?: string;
}) {
  return (
    <Stack spacing={1} data-testid={testId}>
      {blocks.map((block, index) => {
        const key = `${index}-${block.text.slice(0, 24)}`;
        if (block.kind === "subheading") {
          return (
            <Typography key={key} sx={{ fontWeight: 700, fontSize: 14, mt: 1 }}>
              {block.text}
            </Typography>
          );
        }
        if (block.kind === "bullet" || block.kind === "numbered") {
          return (
            <Box key={key} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, flexShrink: 0 }}>
                {block.marker}
              </Typography>
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.65 }}>{block.text}</Typography>
            </Box>
          );
        }
        return (
          <Typography key={key} sx={{ fontSize: 13.5, lineHeight: 1.65 }}>
            {block.text}
          </Typography>
        );
      })}
    </Stack>
  );
}
