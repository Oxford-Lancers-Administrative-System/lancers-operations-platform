import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "@/theme";
import { CLUB_NAME, metadataBase, SITE_DESCRIPTION } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * What every shared link says about the club — LAN-269. Icons, manifest and
 * preview images are Next.js metadata files beside this one, not entries
 * here. The template puts the club's name after each page's own; pages that
 * must read exactly as specified set `title.absolute`. Individual routes
 * override this: token links say less (`TOKEN_LINK_METADATA`), `/join/[code]`
 * says more (LAN-279).
 *
 * Decision history: docs/ux/design-system.md (LAN-269 has no ticket contract)
 */
export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: CLUB_NAME, template: `%s — ${CLUB_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: CLUB_NAME,
  openGraph: {
    type: "website",
    siteName: CLUB_NAME,
    title: CLUB_NAME,
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: CLUB_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
