// Storefront shell: cart state + DemoMart header around every store page.
import { CartProvider } from "@/lib/client/cart-store";
import { Header } from "@/components/store/Header";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-4 sm:py-6">{children}</main>
    </CartProvider>
  );
}
