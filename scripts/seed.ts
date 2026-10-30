// npm run seed — builds the DemoMart world (LLM catalog cached in scripts/.cache/) and reloads the Kitly tables.
// Idempotent: truncates only the Kitly tables. Run `npm run db:migrate` first.
import { kitlySchema } from "@/server/db/schema";
import { connectPg } from "@/server/db/pg";
import { getLLM } from "@/server/llm";
import { buildWorld } from "@/server/seed/world";
import { depthProblems } from "@/server/seed/depth";
import { seedSummary, writeWorld } from "@/server/seed/write";
import { today } from "@/server/today";

const started = Date.now();
const schema = kitlySchema();
const day = today();
const world = await buildWorld({ llm: getLLM(), today: day, log: (m) => console.warn(m) });

const shallow = [...new Set(world.products.map((p) => p.category))].filter(
  (c) =>
    !["school-backpack", "kids-raincoat"].includes(c) &&
    depthProblems(
      world.products.filter((p) => p.category === c),
      world.shops,
    ).length,
);
if (shallow.length) throw new Error(`depth rule failed for ${shallow.join(", ")}`);

const client = await connectPg();
try {
  await writeWorld(client, schema, world);
  console.log(`seed: schema ${schema}, DEMO_TODAY ${day}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (world.failedCategories.length) console.log(`  LLM failed (code-filled): ${world.failedCategories.join(", ")}`);
  console.log(await seedSummary(client, schema, day));
} finally {
  await client.end();
}
