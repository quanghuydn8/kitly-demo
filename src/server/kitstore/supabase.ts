// SupabaseKitStore: implemented in ticket 01 (tables kit_threads / kit_versions / kit_messages).
import type { KitStore } from "@/contract";

const notImplemented = (): never => {
  throw new Error("SupabaseKitStore is not implemented yet (ticket 01). Set KITLY_ADAPTER=memory.");
};

export class SupabaseKitStore implements KitStore {
  createThread = notImplemented;
  appendMessage = notImplemented;
  appendVersion = notImplemented;
  saveSelection = notImplemented;
  listThreads = notImplemented;
  getThread = notImplemented;
}
