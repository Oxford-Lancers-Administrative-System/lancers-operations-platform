"use client";

import { useMemo, useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Metric } from "@/components/metric";
import { PageHeader } from "@/components/page-header";
import { Surface } from "@/components/surface";
import { Notice } from "@/components/notice";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { buildQrMatrix, qrMatrixToSvg } from "@/lib/qr/qr-matrix";
import { formatWhen } from "../../roster/presentation";
import { mintRecruitmentSignupCodeAction } from "./actions";

/**
 * `W1-04` — the season's own sign-up code, big enough to scan off a screen,
 * screenshot or print. `qrMatrixToSvg` is inlined into the page rather than
 * loaded as an image, so `DOWNLOAD` can save the exact markup rendered on
 * screen.
 */
export default function QrCodeView({
  seasonLabel,
  joinUrl,
  signInCount,
  mintedAt,
}: {
  seasonLabel: string;
  joinUrl: string | null;
  signInCount: number;
  mintedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const svg = useMemo(() => (joinUrl ? qrMatrixToSvg(buildQrMatrix(joinUrl), 8) : null), [joinUrl]);
  const svgDataUri = useMemo(
    () => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null),
    [svg],
  );

  function mint() {
    setCopied(false);
    setError(null);
    startTransition(async () => {
      const result = await mintRecruitmentSignupCodeAction();
      setError(result.error);
    });
  }

  async function copyLink() {
    setError(null);
    setCopied(false);
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the link.");
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 560 }} data-testid="recruitment-qr-page">
      <PageHeader
        title="Sign-up code"
        subtitle={seasonLabel}
        back={{ href: "/operate/recruitment", label: "Back to recruitment" }}
      />

      <Surface>
        {svgDataUri ? (
          <>
            <Box
              component="img"
              src={svgDataUri}
              alt="Sign-up QR code"
              sx={{ width: "100%", maxWidth: 320, mx: "auto", display: "block" }}
              data-testid="recruitment-qr-image"
            />
            <Typography variant="body2" sx={{ mt: 2, wordBreak: "break-all" }}>
              {joinUrl}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ justifyContent: "center", mt: 2 }}>
              <Button
                variant="outlined"
                component="a"
                href={svgDataUri}
                download="oxford-lancers-sign-up-qr.svg"
                sx={{ minHeight: 44 }}
                data-testid="recruitment-qr-download"
              >
                DOWNLOAD
              </Button>
              <Button
                variant="outlined"
                onClick={copyLink}
                sx={{ minHeight: 44 }}
                data-testid="recruitment-qr-copy"
              >
                {copied ? "COPIED" : "COPY LINK"}
              </Button>
            </Stack>
            <Box>
              <Metric
                value={signInCount}
                label={`sign-in${signInCount === 1 ? "" : "s"} this season`}
              />
            </Box>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" data-testid="recruitment-qr-none">
            No live code yet.
          </Typography>
        )}

        <Button
          variant="contained"
          onClick={mint}
          disabled={pending}
          sx={{ mt: 3, minHeight: 44 }}
          data-testid="recruitment-qr-mint"
        >
          {joinUrl ? "MINT NEW CODE" : "MINT CODE"}
        </Button>
        {error ? <Notice severity="error">{error}</Notice> : null}
        {mintedAt ? (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            Minted {formatWhen(new Date(mintedAt))}
          </Typography>
        ) : null}
      </Surface>
    </Box>
  );
}
