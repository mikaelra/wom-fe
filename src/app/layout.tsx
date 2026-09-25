import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "World of Mythos",
  description: "World of Mythos",
  // No manual `icons` entry here -- src/app/icon.svg, icon.png, and
  // apple-icon.png (Next's file-based icon convention) are auto-detected
  // and take care of it. That's deliberate, not an oversight: the old setup
  // pointed every browser at /wom.svg alone, but iOS Safari doesn't render
  // SVG favicons at all (browser tab or "Add to Home Screen"), which is
  // why the logo was invisible on phones despite the artwork being right
  // here in the repo -- confirmed live. icon.png/apple-icon.png are
  // rendered PNGs of the same source art (public/wom.svg) for iOS and any
  // other SVG-favicon holdout; icon.svg keeps the crisp vector version for
  // browsers that do support it.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ToastProvider>
      </body>
    </html>
  );
}
