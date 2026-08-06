"use client";

import { resolveFoodIcon } from "../lib/foodIcons";

// FOOD AVATAR — the product photo when the food has one, its icon when it
// doesn't. Every food avatar goes through here so the photo-first,
// icon-as-backup rule is stated once instead of at a dozen render sites.
//
// The photo is served from our own API (foods never hotlink), and the URL
// carries image_updated_at so a replaced photo busts the cache while an
// unchanged one stays hard-cached.
export function FoodAvatar({
  food,
  size = 16,
  variant = "circle",
}: {
  // Only the fields the avatar needs, so quick-add rows and recipe-ingredient
  // rows can pass their own shapes without pretending to be a full Food.
  food: { id: string; icon?: string | null; image_updated_at?: string | null };
  size?: number;
  // "circle" is the bordered avatar used by list rows; "inline" is a bare mark
  // sitting directly in a card header, where a photo becomes a rounded square.
  variant?: "circle" | "inline";
}) {
  const Icon = resolveFoodIcon(food.icon ?? null);

  if (!food.image_updated_at) {
    // ICON FALLBACK
    return variant === "circle" ? (
      <span className="list-row-avatar">
        <Icon size={size} />
      </span>
    ) : (
      <Icon size={size} style={{ flexShrink: 0 }} />
    );
  }

  const src = `/modules/forage/api/foods/${food.id}/image?v=${encodeURIComponent(food.image_updated_at)}`;

  // PHOTO
  return variant === "circle" ? (
    <span className="list-row-avatar food-avatar-photo">
      <img src={src} alt="" loading="lazy" decoding="async" />
    </span>
  ) : (
    <img
      className="food-avatar-inline"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
    />
  );
}
