"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoodAvatar } from "./FoodAvatar";

interface IngredientCardProps {
  food: { id: string; icon?: string | null; image_updated_at?: string | null };
  name: string;
  brand?: string | null;
  isUnmatched?: boolean; // a recipe line not yet matched to a food, drawn in italics
  onOpen?: () => void; // makes the whole card a button with a chevron
  openLabel?: string;
  children: ReactNode; // the detail line under the name
}

// Show a recipe ingredient as a card: its icon and full name on top, and a detail line under them
export function IngredientCard({ food, name, brand, isUnmatched, onOpen, openLabel, children }: IngredientCardProps) {
  const className = `fg-ing-card${isUnmatched ? " is-unmatched" : ""}${onOpen ? " is-link" : ""}`;
  const content = (
    <>

      {/* NAME LINE */}
      <div className="fg-ing-line">

        {/* AVATAR */}
        <FoodAvatar food={food} variant="inline" className="fg-ing-avatar" />

        {/* NAME AND BRAND */}
        <span className="fg-ing-name-wrap">
          <span className="fg-ing-name">{name}</span>
          {brand && <span className="fg-ing-brand">{brand}</span>}
        </span>

        {/* OPEN CHEVRON */}
        {onOpen && <ChevronRight className="fg-ing-chev" aria-hidden />}
      </div>

      {/* DETAIL LINE */}
      <div className="fg-ing-line fg-ing-detail">{children}</div>
    </>
  );

  // Open the food from anywhere on the card; any other card is plain
  return onOpen ? (
    <Button type="button" className={className} onClick={onOpen} aria-label={openLabel}>
      {content}
    </Button>
  ) : (
    <div className={className}>{content}</div>
  );
}

interface IngredientMacrosProps {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

// Show an ingredient's calories and its protein, fat and carbs in their colors
export function IngredientMacros({ kcal, protein, fat, carbs }: IngredientMacrosProps) {
  return (

    // MACROS
    <span className="fg-ing-macros">

      {/* CALORIES */}
      <span className="fg-ing-kcal">{Math.round(kcal)} kcal</span>

      {/* PROTEIN */}
      <span className="fg-ing-p">{Math.round(protein)}P</span>

      {/* FAT */}
      <span className="fg-ing-f">{Math.round(fat)}F</span>

      {/* CARBS */}
      <span className="fg-ing-c">{Math.round(carbs)}C</span>
    </span>
  );
}
