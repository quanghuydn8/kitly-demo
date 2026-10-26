// Category icon on its event colour tile (no product images — PRD). Icon names come from the taxonomy (kebab-case).
import {
  Archive,
  Armchair,
  Baby,
  Backpack,
  Bath,
  Bed,
  BedDouble,
  BedSingle,
  Book,
  Bug,
  ChefHat,
  Cherry,
  Coffee,
  Cookie,
  CookingPot,
  CupSoda,
  Droplets,
  Fan,
  Flame,
  Flashlight,
  Footprints,
  Gift,
  Headphones,
  HeartHandshake,
  Keyboard,
  Lamp,
  LampDesk,
  Laptop,
  Mail,
  Milk,
  Monitor,
  Mouse,
  MoveDiagonal,
  Notebook,
  Package,
  Palette,
  PanelsTopLeft,
  Pencil,
  Plug,
  Refrigerator,
  Sandwich,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Sun,
  Table,
  Tag,
  Tent,
  Thermometer,
  Umbrella,
  Utensils,
  Waves,
  Webcam,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { categoryById, EVENT_COLORS } from "@/contract";

const ICONS: Record<string, LucideIcon> = {
  archive: Archive,
  armchair: Armchair,
  baby: Baby,
  backpack: Backpack,
  bath: Bath,
  bed: Bed,
  "bed-double": BedDouble,
  "bed-single": BedSingle,
  book: Book,
  bug: Bug,
  "chef-hat": ChefHat,
  cherry: Cherry,
  coffee: Coffee,
  cookie: Cookie,
  "cooking-pot": CookingPot,
  "cup-soda": CupSoda,
  droplets: Droplets,
  fan: Fan,
  flame: Flame,
  flashlight: Flashlight,
  footprints: Footprints,
  gift: Gift,
  headphones: Headphones,
  "heart-handshake": HeartHandshake,
  keyboard: Keyboard,
  lamp: Lamp,
  "lamp-desk": LampDesk,
  laptop: Laptop,
  mail: Mail,
  milk: Milk,
  monitor: Monitor,
  mouse: Mouse,
  "move-diagonal": MoveDiagonal,
  notebook: Notebook,
  package: Package,
  palette: Palette,
  "panels-top-left": PanelsTopLeft,
  pencil: Pencil,
  plug: Plug,
  refrigerator: Refrigerator,
  sandwich: Sandwich,
  shirt: Shirt,
  "shopping-basket": ShoppingBasket,
  sparkles: Sparkles,
  sun: Sun,
  table: Table,
  tent: Tent,
  thermometer: Thermometer,
  umbrella: Umbrella,
  utensils: Utensils,
  waves: Waves,
  webcam: Webcam,
  wine: Wine,
};

export function categoryStyle(categoryId: string) {
  const c = categoryById(categoryId);
  const colors = EVENT_COLORS[c?.event ?? "other"];
  return { Icon: (c && ICONS[c.icon]) || Tag, bg: colors.bg, fg: colors.fg, label: c?.label ?? categoryId };
}

/** Square colour tile with the category icon. `size` = Tailwind size class for the tile. */
export function CategoryIcon({
  category,
  className = "aspect-square w-full",
  iconClassName = "h-1/3 w-1/3",
}: {
  category: string;
  className?: string;
  iconClassName?: string;
}) {
  const { Icon, bg, fg, label } = categoryStyle(category);
  return (
    <div
      className={`flex items-center justify-center rounded-xl ${bg} ${fg} ${className}`}
      aria-label={label}
      role="img"
    >
      <Icon className={iconClassName} strokeWidth={1.5} />
    </div>
  );
}
