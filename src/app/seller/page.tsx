// /seller?shop=<shopId> = Seller Intelligence (T12). No ?shop= ⇒ All shops.
import type { Metadata } from "next";
import { SellerScreen } from "@/components/seller/SellerScreen";
import { today } from "@/server/today";

export const metadata: Metadata = { title: "Seller Centre · DemoMart" };

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ shop?: string | string[] }> }) {
  const { shop } = await searchParams;
  const shopId = (Array.isArray(shop) ? shop[0] : shop)?.trim() || null;
  return <SellerScreen key={shopId ?? "all"} initialShopId={shopId === "all" ? null : shopId} demoToday={today()} />;
}
