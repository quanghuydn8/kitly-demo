import { CATEGORIES, type CategoriesResponse } from "@/contract";
import { json } from "@/server/http/json";

export async function GET(): Promise<Response> {
  return json<CategoriesResponse>({
    categories: CATEGORIES.map(({ id, label, event, icon, color }) => ({ id, label, event, icon, color })),
  });
}
