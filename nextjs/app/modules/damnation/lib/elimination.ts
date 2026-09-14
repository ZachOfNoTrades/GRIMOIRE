import { COMMANDER_DAMAGE_LETHAL } from "./constants";
import type { EliminationReason } from "../types/damnation";

// Why a player is out, or null. Shared by the server (snapshots) and the cards, which run it on
// totals that include taps not yet sent, so a player shows as out the moment their life hits 0
// rather than when the change reaches the server.
export function eliminationReason(
  player: { eliminated_override: boolean | null; conceded: boolean; life_total: number },
  commanderDamageTaken: number[]
): EliminationReason {
  if (player.eliminated_override === true) return "host";
  if (player.eliminated_override === false) return null;
  if (player.conceded) return "conceded";
  if (player.life_total <= 0) return "life";
  if (commanderDamageTaken.some((damage) => damage >= COMMANDER_DAMAGE_LETHAL)) return "commander_damage";
  return null;
}
