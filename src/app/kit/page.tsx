import { Suspense } from "react";
import { KitScreen } from "@/components/kit/KitScreen";

export const metadata = { title: "Kitly · DemoMart" };

export default function KitPage() {
  return (
    <Suspense fallback={null}>
      <KitScreen />
    </Suspense>
  );
}
