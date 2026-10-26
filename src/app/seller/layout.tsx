import { Suspense } from "react";
import { Header } from "@/components/Header";

// Seller Intelligence lives outside the (store) group (lane ownership) but wears the same header.
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[92px] bg-[var(--accent)]" />}>
        <Header />
      </Suspense>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </>
  );
}
