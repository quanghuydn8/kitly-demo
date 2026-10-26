import { Suspense } from "react";
import { Header } from "@/components/Header";

// Kitly lives outside the (store) group (lane ownership) but wears the same header, in "Describe your need" mode.
export default function KitLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[92px] bg-[var(--accent)]" />}>
        <Header initialMode="need" />
      </Suspense>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </>
  );
}
