// SupabaseAdapter: implemented in ticket 01. Until then every method throws so a misconfigured env fails loudly.
import type { CommerceAdapter } from "@/contract";

const notImplemented = (): never => {
  throw new Error("SupabaseAdapter is not implemented yet (ticket 01). Set KITLY_ADAPTER=memory.");
};

export class SupabaseAdapter implements CommerceAdapter {
  listShops = notImplemented;
  getProduct = notImplemented;
  searchProducts = notImplemented;
  listVouchers = notImplemented;
  getPersona = notImplemented;
  recordIntent = notImplemented;
  recordDemandItems = notImplemented;
  demandItemsSince = notImplemented;
  recentDemandItems = notImplemented;
  updateListing = notImplemented;
  undoListing = notImplemented;
}
