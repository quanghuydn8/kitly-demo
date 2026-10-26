import { CATEGORIES } from "@/contract";
import { handle, json } from "@/server/http";

export const GET = handle(async () => json({ categories: CATEGORIES }));
