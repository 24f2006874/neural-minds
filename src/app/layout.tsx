import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import PwaBridge from "@/components/drishti/pwa";

export const metadata: Metadata = {
  title: "DRISHTI — Trust-Gated DR Screening",
  description:
    "AI that knows when to trust itself. Trust-gated diabetic retinopathy screening — quality gate, lesion evidence, CNN grading, Grad-CAM explainability and trust routing. Validated on 550 held-out APTOS images. Team Neural Minds · SIH 2026 PS 26038.",
  keywords: [
    "DRISHTI",
    "diabetic retinopathy",
    "AI screening",
    "Grad-CAM",
    "Smart India Hackathon",
    "SIH 2026",
    "PS 26038",
    "MathWorks",
  ],
  authors: [{ name: "Team Neural Minds" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DRISHTI",
  },
  icons: { icon: "/logo.svg", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title: "DRISHTI — AI that knows when to trust itself",
    description: "Trust-gated DR screening. 92.8% sensitivity · 94.5% specificity · QWK 0.899.",
    siteName: "DRISHTI",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#060B14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router root layout: applies to all views */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster position="bottom-right" richColors theme="dark" />
        <PwaBridge />
      </body>
    </html>
  );
}
