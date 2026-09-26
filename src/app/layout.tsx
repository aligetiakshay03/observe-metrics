import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/providers/Toaster";

const siteUrl = process.env.APP_URL ?? "http://localhost:3100";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "ObserveMetrics — AI Usage & Cost Intelligence", template: "%s · ObserveMetrics" },
  description:
    "Track models, tokens, spend, latency and usage across OpenAI, Anthropic, Google Gemini and Mistral — then uncover the patterns driving AI cost and performance.",
  applicationName: "ObserveMetrics",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "ObserveMetrics",
    title: "ObserveMetrics — AI Usage & Cost Intelligence",
    description: "Know exactly what your AI is costing you. Then find where to optimize it.",
    url: "/",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ObserveMetrics" }],
  },
  twitter: { card: "summary_large_image", title: "ObserveMetrics — AI Usage & Cost Intelligence", description: "Know exactly what your AI is costing you." },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c10" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
          Skip to content
        </a>
        <ThemeProvider>
          <Toaster>{children}</Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
