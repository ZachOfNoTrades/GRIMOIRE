// Shared config for the "gamble for health" short-rest mechanic. Kept in its own module (no
// server-only imports like mssql) so both the server lib (userStateFunctions) and the client
// page can import the same numbers without the cost/die-size drifting out of sync.

// Coins spent per roll. Tune freely — it's the "x coins" the user pays for a short rest.
export const GAMBLE_COST = 2;

// Sides on the recovery die. A d20 — like the Baldur's Gate roll the overlay animates. The heal
// is the rolled value (1..GAMBLE_DIE_SIDES) capped at the user's missing HP.
export const GAMBLE_DIE_SIDES = 20;
