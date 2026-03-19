import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";
import { Theme } from "@radix-ui/themes";

import { AppProviders } from "../components/app-providers";
import { NavBar } from "../components/nav-bar";

import "./globals.css";
import "@radix-ui/themes/styles.css";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Meridian Markets",
  description:
    "Binary stock outcome markets on Solana with live market discovery, Phoenix order books, and wallet-based trading.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable}`}>
        <Theme
          appearance="light"
          accentColor="teal"
          grayColor="sage"
          radius="large"
          scaling="105%"
        >
          <AppProviders>
            <NavBar />
            {children}
          </AppProviders>
        </Theme>
      </body>
    </html>
  );
}
