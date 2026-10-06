import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";
import LoadingOverlay from "@/components/loading/LoadingOverlay";
import AppleTransactionSync from "@/components/shop/AppleTransactionSync";
import SteamWelcome from "@/components/steam/SteamWelcome";

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
  // No manual `icons` entry here -- src/app/icon.png and apple-icon.png
  // (Next's file-based icon convention) are auto-detected and take care of
  // it. Both are PNGs on purpose: iOS Safari doesn't render SVG favicons at
  // all (browser tab or "Add to Home Screen"), and the logo is a picture
  // (the frog in front of the loading animation), not vector art. All of
  // them are generated -- see branding/README.md.
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
          <LoadingOverlay />
          <AppleTransactionSync />
          <SteamWelcome />
        </ToastProvider>
      </body>
    </html>
  );
}
