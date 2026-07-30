import {
  Apple,
  Banana,
  Cherry,
  Grape,
  Citrus,
  Carrot,
  Salad,
  Wheat,
  Bean,
  Nut,
  Vegan,
  Beef,
  Drumstick,
  Fish,
  Shrimp,
  Egg,
  EggFried,
  Ham,
  Sandwich,
  Hamburger,
  Pizza,
  Croissant,
  Soup,
  CookingPot,
  Utensils,
  Cookie,
  Cake,
  CakeSlice,
  Donut,
  IceCream,
  IceCreamCone,
  Dessert,
  Candy,
  CandyCane,
  Lollipop,
  Popcorn,
  Coffee,
  Milk,
  CupSoda,
  GlassWater,
  Martini,
  Beer,
  Wine,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Preseeded icon set for foods. Picking from this fixed list (instead of letting
// users free-type any Lucide name) keeps the picker UI manageable and means we
// never have to render-fall-back on a typo / removed icon. To add a new option,
// append it here — existing rows with unknown codes silently fall back to the
// generic FALLBACK_FOOD_ICON below.
export interface FoodIconOption {
  code: string;
  label: string;
  Icon: LucideIcon;
}

// Neutral "this is food" mark used when a row has no icon assigned (or an
// unrecognized legacy code). Deliberately NOT a member of FOOD_ICONS so it
// can't be picked — apple-on-apple ambiguity is exactly what this avoids.
export const FALLBACK_FOOD_ICON: LucideIcon = UtensilsCrossed;

export const FOOD_ICONS: FoodIconOption[] = [
  // Fruits
  { code: "apple", label: "Apple", Icon: Apple },
  { code: "banana", label: "Banana", Icon: Banana },
  { code: "cherry", label: "Cherry", Icon: Cherry },
  { code: "grape", label: "Grape", Icon: Grape },
  { code: "citrus", label: "Citrus", Icon: Citrus },
  // Vegetables / grains / legumes
  { code: "carrot", label: "Carrot", Icon: Carrot },
  { code: "salad", label: "Salad", Icon: Salad },
  { code: "wheat", label: "Wheat", Icon: Wheat },
  { code: "bean", label: "Beans", Icon: Bean },
  { code: "nut", label: "Nuts", Icon: Nut },
  { code: "vegan", label: "Plant-based", Icon: Vegan },
  // Proteins
  { code: "beef", label: "Beef", Icon: Beef },
  { code: "ham", label: "Ham", Icon: Ham },
  { code: "drumstick", label: "Drumstick", Icon: Drumstick },
  { code: "fish", label: "Fish", Icon: Fish },
  { code: "shrimp", label: "Shrimp", Icon: Shrimp },
  { code: "egg", label: "Egg", Icon: Egg },
  { code: "egg-fried", label: "Fried egg", Icon: EggFried },
  // Meals / baked
  { code: "sandwich", label: "Sandwich", Icon: Sandwich },
  { code: "hamburger", label: "Burger", Icon: Hamburger },
  { code: "pizza", label: "Pizza", Icon: Pizza },
  { code: "croissant", label: "Croissant", Icon: Croissant },
  { code: "soup", label: "Soup", Icon: Soup },
  { code: "cooking-pot", label: "Stew", Icon: CookingPot },
  { code: "utensils", label: "Meal", Icon: Utensils },
  // Sweets / snacks
  { code: "cookie", label: "Cookie", Icon: Cookie },
  { code: "cake", label: "Cake", Icon: Cake },
  { code: "cake-slice", label: "Cake slice", Icon: CakeSlice },
  { code: "donut", label: "Donut", Icon: Donut },
  { code: "ice-cream", label: "Ice cream", Icon: IceCream },
  { code: "ice-cream-cone", label: "Ice cream cone", Icon: IceCreamCone },
  { code: "dessert", label: "Pudding", Icon: Dessert },
  { code: "candy", label: "Candy", Icon: Candy },
  { code: "candy-cane", label: "Candy cane", Icon: CandyCane },
  { code: "lollipop", label: "Lollipop", Icon: Lollipop },
  { code: "popcorn", label: "Popcorn", Icon: Popcorn },
  // Drinks
  { code: "milk", label: "Milk", Icon: Milk },
  { code: "coffee", label: "Coffee", Icon: Coffee },
  { code: "cup-soda", label: "Soda", Icon: CupSoda },
  { code: "glass-water", label: "Water", Icon: GlassWater },
  { code: "martini", label: "Cocktail", Icon: Martini },
  { code: "beer", label: "Beer", Icon: Beer },
  { code: "wine", label: "Wine", Icon: Wine },
];

// Just the valid icon codes — handed to the label-OCR vision prompt so a scan can
// auto-pick a fitting icon, and used to validate whatever it returns.
export const FOOD_ICON_CODES: string[] = FOOD_ICONS.map((opt) => opt.code);

const ICON_BY_CODE: Record<string, LucideIcon> = Object.fromEntries(
  FOOD_ICONS.map((opt) => [opt.code, opt.Icon])
);

// Resolve a stored food.icon value (possibly null, possibly an unknown legacy
// code) to a render-ready Lucide component. Falls back to FALLBACK_FOOD_ICON
// (a generic crossed-utensils mark) so the UI always has something to draw and
// "no icon set" is visually distinct from "apple was deliberately picked".
export function resolveFoodIcon(code: string | null | undefined): LucideIcon {
  if (!code) return FALLBACK_FOOD_ICON;
  return ICON_BY_CODE[code] ?? FALLBACK_FOOD_ICON;
}
