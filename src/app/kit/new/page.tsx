// /kit/new = empty chat with example chips; /kit/new?q= starts a new kit at once.
import { KitScreen } from "@/components/kit/KitScreen";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";

export default async function NewKitPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  return <KitScreen initialQuery={Array.isArray(q) ? q[0] : q} demoToday={today()} />;
}
