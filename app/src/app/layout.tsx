import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}

