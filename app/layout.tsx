import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Inter } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["SOFT", "opsz"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand" });

export const metadata: Metadata = {
  title: "myhandwriting - type in your own handwriting",
  description:
    "Write a few lines in any notebook, snap a photo, and type anything in your own handwriting. Free, no signup, and your photos are processed in your browser.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121317" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
