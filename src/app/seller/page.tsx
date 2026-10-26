import { Suspense } from "react";
import { SellerScreen } from "@/components/seller/SellerScreen";

export const metadata = { title: "Seller Intelligence · DemoMart" };

export default function SellerPage() {
  return (
    <Suspense fallback={null}>
      <SellerScreen />
    </Suspense>
  );
}
