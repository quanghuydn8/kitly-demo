// SupabaseKitStore: Kitly threads / versions / messages in kit_threads, kit_versions, kit_messages (DATA.md §6).
// Owner checks happen in every query (owner = cookie kitly_uid); another owner's thread behaves as missing.
import type { KitMessage, KitSelection, KitStore, KitThreadSummary, KitVersion, PersonaId } from "@/contract";
import { iso, must, supabaseClient } from "@/server/db/supabase";
import { THREAD_LIST_MAX, threadTitle } from "./in-memory";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Record timestamps (not business dates), so wall-clock time is correct here (same as InMemoryKitStore).
const stamp = () => new Date().toISOString();

interface ThreadRow {
  id: string;
  title: string;
  persona: string;
  updated_at: string;
  kit_versions: { count: number }[];
}
interface VersionRow {
  thread_id: string;
  version: number;
  created_at: string;
  kind: KitVersion["kind"];
  user_text: string;
  plan: KitVersion["plan"];
  excluded_keys: string[];
  status: KitVersion["status"];
  options: KitVersion["options"];
  explanation: string;
  diff: KitVersion["diff"];
  selection: KitVersion["selection"];
  follow_up: KitVersion["followUp"];
}
interface MessageRow {
  thread_id: string;
  after_version: number;
  created_at: string;
  user_text: string;
  answer: string;
  follow_up: KitMessage["followUp"];
}

const toSummary = (r: ThreadRow): KitThreadSummary => ({
  id: r.id,
  title: r.title,
  updatedAt: iso(r.updated_at),
  versionCount: r.kit_versions?.[0]?.count ?? 0,
  persona: r.persona as PersonaId,
});
const toVersion = (r: VersionRow): KitVersion => ({
  threadId: r.thread_id,
  version: r.version,
  createdAt: iso(r.created_at),
  kind: r.kind,
  userText: r.user_text,
  plan: r.plan,
  excludedKeys: r.excluded_keys ?? [],
  status: r.status,
  options: r.options ?? [],
  explanation: r.explanation,
  diff: r.diff,
  selection: r.selection,
  followUp: r.follow_up,
});
const toMessage = (r: MessageRow): KitMessage => ({
  threadId: r.thread_id,
  afterVersion: r.after_version,
  createdAt: iso(r.created_at),
  userText: r.user_text,
  answer: r.answer,
  followUp: r.follow_up,
});

const THREAD_COLS = "id, title, persona, updated_at, kit_versions(count)";

export class SupabaseKitStore implements KitStore {
  private get db() {
    return supabaseClient();
  }

  /** Throws unless the thread exists and belongs to owner. */
  private async assertOwned(threadId: string, owner: string): Promise<void> {
    const found = UUID.test(threadId)
      ? must(
          await this.db.from("kit_threads").select("id").eq("id", threadId).eq("owner", owner).maybeSingle(),
          "kit thread",
        )
      : null;
    if (!found) throw new Error(`thread ${threadId} not found`);
  }

  private async touch(threadId: string, at: string): Promise<void> {
    must(await this.db.from("kit_threads").update({ updated_at: at }).eq("id", threadId), "touch thread");
  }

  async createThread(owner: string, title: string, persona: PersonaId): Promise<{ threadId: string }> {
    const row = must(
      await this.db
        .from("kit_threads")
        .insert({ owner, title: threadTitle(title), persona, updated_at: stamp() })
        .select("id")
        .single(),
      "createThread",
    );
    return { threadId: row.id };
  }

  async appendMessage(m: Omit<KitMessage, "createdAt">, owner: string): Promise<KitMessage> {
    await this.assertOwned(m.threadId, owner);
    const createdAt = stamp();
    const row = must(
      await this.db
        .from("kit_messages")
        .insert({
          thread_id: m.threadId,
          after_version: m.afterVersion,
          user_text: m.userText,
          answer: m.answer,
          follow_up: m.followUp,
          created_at: createdAt,
        })
        .select("*")
        .single(),
      "appendMessage",
    );
    await this.touch(m.threadId, createdAt);
    return toMessage(row as MessageRow);
  }

  async appendVersion(v: Omit<KitVersion, "version" | "createdAt">, owner: string): Promise<KitVersion> {
    await this.assertOwned(v.threadId, owner);
    // version = last + 1; unique (thread_id, version) turns a concurrent append into a retry.
    for (let attempt = 0; ; attempt++) {
      const last = must(
        await this.db
          .from("kit_versions")
          .select("version")
          .eq("thread_id", v.threadId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "appendVersion",
      );
      const createdAt = stamp();
      const res = await this.db
        .from("kit_versions")
        .insert({
          thread_id: v.threadId,
          version: (last?.version ?? 0) + 1,
          kind: v.kind,
          user_text: v.userText,
          plan: v.plan,
          excluded_keys: v.excludedKeys,
          status: v.status,
          options: v.options,
          explanation: v.explanation,
          diff: v.diff,
          selection: v.selection,
          follow_up: v.followUp,
          created_at: createdAt,
        })
        .select("*")
        .single();
      if (res.error?.code === "23505" && attempt < 3) continue;
      const row = must(res, "appendVersion");
      await this.touch(v.threadId, createdAt);
      return toVersion(row as VersionRow);
    }
  }

  async saveSelection(threadId: string, owner: string, selection: KitSelection): Promise<void> {
    await this.assertOwned(threadId, owner);
    const latest = must(
      await this.db
        .from("kit_versions")
        .select("id")
        .eq("thread_id", threadId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "saveSelection",
    );
    if (!latest) throw new Error(`thread ${threadId} has no version`);
    must(await this.db.from("kit_versions").update({ selection }).eq("id", latest.id), "saveSelection");
  }

  async listThreads(owner: string): Promise<KitThreadSummary[]> {
    const rows = must(
      await this.db
        .from("kit_threads")
        .select(THREAD_COLS)
        .eq("owner", owner)
        .order("updated_at", { ascending: false })
        .limit(THREAD_LIST_MAX),
      "listThreads",
    );
    return (rows as unknown as ThreadRow[]).map(toSummary);
  }

  async getThread(
    threadId: string,
    owner: string,
  ): Promise<{ thread: KitThreadSummary; versions: KitVersion[]; messages: KitMessage[] } | null> {
    if (!UUID.test(threadId)) return null;
    const t = must(
      await this.db.from("kit_threads").select(THREAD_COLS).eq("id", threadId).eq("owner", owner).maybeSingle(),
      "getThread",
    );
    if (!t) return null;
    const [versions, messages] = await Promise.all([
      this.db.from("kit_versions").select("*").eq("thread_id", threadId).order("version"),
      this.db.from("kit_messages").select("*").eq("thread_id", threadId).order("created_at").order("id"),
    ]);
    return {
      thread: toSummary(t as unknown as ThreadRow),
      versions: must<VersionRow[]>(versions, "getThread versions").map(toVersion),
      messages: must<MessageRow[]>(messages, "getThread messages").map(toMessage),
    };
  }
}
