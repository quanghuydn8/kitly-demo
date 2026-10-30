// InMemoryKitStore: Kitly threads/versions/messages in process memory (tests, KITLY_ADAPTER=memory).
// Not serverless-safe by nature: production uses SupabaseKitStore (ticket 01).
import type { KitMessage, KitSelection, KitStore, KitThreadSummary, KitVersion, PersonaId } from "@/contract";

interface Thread {
  id: string;
  owner: string;
  title: string;
  persona: PersonaId;
  updatedAt: string;
  /** Write order, the tie-break when two writes share a millisecond (Postgres now() has microseconds; Date has ms). */
  touched: number;
  versions: KitVersion[];
  messages: KitMessage[];
}

export const THREAD_TITLE_MAX = 60;
export const THREAD_LIST_MAX = 30;

export function threadTitle(text: string): string {
  return text.trim().slice(0, THREAD_TITLE_MAX).trimEnd();
}

const clone = <T>(v: T): T => structuredClone(v);
// Record timestamps (not business dates), so wall-clock time is correct here.
const stamp = () => new Date().toISOString();

export class InMemoryKitStore implements KitStore {
  private threads = new Map<string, Thread>();
  private writes = 0;

  private owned(threadId: string, owner: string): Thread {
    const t = this.threads.get(threadId);
    if (!t || t.owner !== owner) throw new Error(`thread ${threadId} not found`);
    return t;
  }

  private summary(t: Thread): KitThreadSummary {
    return { id: t.id, title: t.title, updatedAt: t.updatedAt, versionCount: t.versions.length, persona: t.persona };
  }

  async createThread(owner: string, title: string, persona: PersonaId): Promise<{ threadId: string }> {
    const id = crypto.randomUUID();
    this.threads.set(id, {
      id,
      owner,
      title: threadTitle(title),
      persona,
      updatedAt: stamp(),
      touched: ++this.writes,
      versions: [],
      messages: [],
    });
    return { threadId: id };
  }

  async appendMessage(m: Omit<KitMessage, "createdAt">, owner: string): Promise<KitMessage> {
    const t = this.owned(m.threadId, owner);
    const msg: KitMessage = { ...clone(m), createdAt: stamp() };
    t.messages.push(msg);
    t.updatedAt = msg.createdAt;
    t.touched = ++this.writes;
    return clone(msg);
  }

  async appendVersion(v: Omit<KitVersion, "version" | "createdAt">, owner: string): Promise<KitVersion> {
    const t = this.owned(v.threadId, owner);
    const version: KitVersion = { ...clone(v), version: t.versions.length + 1, createdAt: stamp() };
    t.versions.push(version);
    t.updatedAt = version.createdAt;
    t.touched = ++this.writes;
    return clone(version);
  }

  async saveSelection(threadId: string, owner: string, selection: KitSelection): Promise<void> {
    const t = this.owned(threadId, owner);
    const latest = t.versions.at(-1);
    if (!latest) throw new Error(`thread ${threadId} has no version`);
    latest.selection = clone(selection);
  }

  async listThreads(owner: string): Promise<KitThreadSummary[]> {
    return [...this.threads.values()]
      .filter((t) => t.owner === owner)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.touched - a.touched)
      .slice(0, THREAD_LIST_MAX)
      .map((t) => this.summary(t));
  }

  async getThread(
    threadId: string,
    owner: string,
  ): Promise<{ thread: KitThreadSummary; versions: KitVersion[]; messages: KitMessage[] } | null> {
    const t = this.threads.get(threadId);
    if (!t || t.owner !== owner) return null;
    return { thread: this.summary(t), versions: clone(t.versions), messages: clone(t.messages) };
  }
}
