import type { Metadata } from "next";

import { AppProviders } from "../components/app-providers";
import { NavBar } from "../components/nav-bar";

import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian",
  description: "Binary stock outcome markets on Solana devnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <NavBar />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
