import React from "react"
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const _spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});
const _jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Token Launchpad - 4claw / Kibu / Clawnch / SynthLaunch",
  description:
    "Multi-platform token launchpad. Deploy AI agent tokens on BSC, Base, and Solana via 4claw, Kibu, Clawnch, SynthLaunch, Molaunch, and FourClaw.Fun. Post via Moltx, Moltbook, 4claw.org, Clawstr, or BapBook.",
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
