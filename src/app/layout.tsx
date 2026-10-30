import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemoMart · Kitly",
  description: "Tell Kitly your need, get the whole kit. Sellers see which kits are missing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
