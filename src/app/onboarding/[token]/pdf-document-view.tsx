"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * A PDF rendered into the page, page after page, so it scrolls end to end —
 * LAN-363, Brian 2026-09-16.
 *
 * Not an `<iframe>`: iOS Safari hands a framed PDF to its own viewer, which on
 * a phone shows one page and offers no way through the rest, and a framed
 * document is also exactly what `X-Frame-Options: DENY` and the
 * `frame-ancestors 'none'` policy exist to stop. pdf.js draws every page into
 * its own canvas here, inside the ordinary page scroll, so the document is as
 * long as it is and the phone scrolls it the way it scrolls everything else.
 *
 * `pdfjs-dist` is imported dynamically inside the effect, so none of it is in
 * the page's own bundle and none of it runs on the server. The worker and the
 * standard font programs are served from this origin out of `/pdfjs/`, copied
 * there from the installed package by `scripts/copy-pdfjs-assets.mjs`; the
 * application's Content-Security-Policy names no `script-src` or `worker-src`,
 * so nothing blocks either, and `tests/pdf-worker-policy.test.ts` fails if a
 * future policy would.
 *
 * Reading to the end is not enforced and never has been: the tick is the
 * consent, and LAN-213 settled that.
 */

/** Where `scripts/copy-pdfjs-assets.mjs` puts the two things pdf.js needs from this origin. */
const WORKER_PATH = "/pdfjs/pdf.worker.min.mjs";
const STANDARD_FONTS_PATH = "/pdfjs/standard_fonts/";

/** The viewer's own height on a phone and on a desktop — the document scrolls inside it. */
const VIEWER_MAX_HEIGHT = { xs: 420, md: 560 };

const PDF_LOADING = "Loading the document…";
const PDF_FAILED = "The document could not be displayed. The text of it is below.";

export function PdfDocumentView({ path, testId }: { path: string; testId?: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = container.current;
    if (!host) return;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_PATH;

        const document_ = await pdfjs.getDocument({
          url: path,
          standardFontDataUrl: STANDARD_FONTS_PATH,
        }).promise;
        if (cancelled) return;

        host.replaceChildren();
        // Every page, drawn at the container's own width. A device with a
        // higher pixel ratio gets a proportionally larger canvas so the text
        // is not soft; the CSS width stays the container's.
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = host.clientWidth || 320;

        for (let number = 1; number <= document_.numPages; number += 1) {
          const page = await document_.getPage(number);
          if (cancelled) return;
          const unscaled = page.getViewport({ scale: 1 });
          const scale = width / unscaled.width;
          const viewport = page.getViewport({ scale: scale * ratio });

          const canvas = window.document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.marginBottom = "12px";
          canvas.setAttribute("data-pdf-page", String(number));
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${number} of ${document_.numPages}`);
          host.append(canvas);

          const context = canvas.getContext("2d");
          if (!context) throw new Error("no 2d context");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          if (cancelled) return;
          setPageCount(number);
        }

        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <Box data-testid={testId} data-pdf-state={state} data-pdf-pages={pageCount}>
      <Box
        sx={{
          border: "1px solid rgba(0,0,0,0.23)",
          borderRadius: 1,
          p: 1,
          maxHeight: VIEWER_MAX_HEIGHT,
          overflow: "auto",
          bgcolor: "background.paper",
          WebkitOverflowScrolling: "touch",
        }}
        ref={container}
        data-testid="pdf-pages"
      />
      {state === "loading" ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>{PDF_LOADING}</Typography>
      ) : null}
      {state === "failed" ? (
        <Typography sx={{ fontSize: 13, color: "error.main", mt: 1 }} data-testid="pdf-failed">
          {PDF_FAILED}
        </Typography>
      ) : null}
    </Box>
  );
}
