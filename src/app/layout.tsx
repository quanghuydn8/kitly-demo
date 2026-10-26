import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemoMart · Kitly",
  description: "Tell Kitly your need, get the whole kit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
