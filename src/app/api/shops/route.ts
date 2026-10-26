import { getAdapter } from "@/server/adapter";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ shops: await getAdapter().listShops() }));
