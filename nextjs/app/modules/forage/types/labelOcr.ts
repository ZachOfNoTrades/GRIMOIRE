// Cleaned/validated draft returned by the API and consumed by FoodModal as a
// prefill. Nutrients are keyed by `code` because the modal resolves codes to
// nutrient.id once useNutrients() has loaded. `servings` may contain multiple
// rows when the label declares parallel UOMs (e.g. "1 cup (240 mL)" → two
// rows). All emitted units are guaranteed to exist in food_units. Falls back
// to a single [{ unit: 'g', units_per_serving: 0 }] when nothing recognizable
// was on the label so the modal still has a row to show.
//
// Macros and nutrient values are `null` when the parser could not find the
// field on the label, and `0` when the label explicitly says zero (e.g.
// "Trans Fat 0g"). The modal uses null to mean "leave the existing input
// blank so the dash placeholder shows" and 0 to mean "fill the input with 0".
export interface LabelOcrDraft {
  name: string;
  brand: string;
  // Decoded UPC/EAN product code (front- or back-of-pack barcode), or null when
  // none could be read. Filled by zbarimg on the uploaded images, with the
  // vision LLM's printed-digit read as a fallback. The modal pre-fills the
  // Barcode field from it.
  barcode_upc: string | null;
  // True only when the image carried a real Nutrition/Supplement Facts panel with
  // an EXPLICIT serving size. Nutrition (macros + nutrients) is emitted only in
  // that case — front-of-pack marketing claims ("24g protein") never populate it.
  // The UI uses this to decide whether the nutrition scan "captured" anything.
  serving_size_stated: boolean;
  // Best-matching FOOD_ICONS code the vision model picked for this product (e.g.
  // "cup-soda" for a soda), or null when none fit / not read. The wizard applies
  // it to the food's icon avatar. Tesseract OCR never sets it.
  icon: string | null;
  servings: Array<{ unit: string; units_per_serving: number }>;
  kcal_per_serving: number | null;
  protein_g_per_serving: number | null;
  carbs_g_per_serving: number | null;
  fat_g_per_serving: number | null;
  nutrients_by_code: Record<string, number>;
}
