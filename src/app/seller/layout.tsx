// Seller Centre shell: the DemoMart header (its "Seller Centre" link leads here) above the seller view.
import { CartProvider } from "@/lib/client/cart-store";
import { PersonaProvider } from "@/lib/client/persona-store";
import { Header } from "@/components/store/Header";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <PersonaProvider>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-4 sm:py-6">{children}</main>
      </PersonaProvider>
    </CartProvider>
  );
}
