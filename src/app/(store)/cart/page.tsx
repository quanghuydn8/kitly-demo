// Cart page (T10): client cart grouped by shop with shipping per shop.
import { CartView } from "@/components/store/CartView";

export default function CartPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Shopping cart</h1>
      <CartView />
    </div>
  );
}
