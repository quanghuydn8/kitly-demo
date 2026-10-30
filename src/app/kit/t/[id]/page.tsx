// /kit/t/<threadId> = one kit; reload keeps it (GET /api/threads/:id), another browser's kit → "Kit not found".
import { KitScreen } from "@/components/kit/KitScreen";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";

export default async function KitThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KitScreen key={id} threadId={id} demoToday={today()} />;
}
