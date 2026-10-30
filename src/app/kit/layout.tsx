// Kitly shell: DemoMart header (shared cart) above a full-height three-column screen.
import { CartProvider } from "@/lib/client/cart-store";
import { PersonaProvider } from "@/lib/client/persona-store";
import { Header } from "@/components/store/Header";

export default function KitLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <PersonaProvider>
        <div className="flex h-dvh flex-col">
          <Header inKit />
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </PersonaProvider>
    </CartProvider>
  );
}
