import { LIFE_MAX, LIFE_MIN } from "./constants";
import { resolveLayout } from "./boardLayouts";
import type { HostSnapshot, PlayerView, SessionSnapshot, SessionStatus } from "../types/damnation";

// Board changes shown the moment the host makes them, before the server answers. Each patch is
// applied on top of the latest snapshot until its request settles, so every patch must be
// idempotent: applied to a snapshot that already contains the change, it changes nothing (a
// broadcast can land before the request's own response).

export type SnapshotPatch = <T extends SessionSnapshot>(snapshot: T) => T;

const mapPlayers = <T extends SessionSnapshot>(snapshot: T, update: (player: PlayerView) => PlayerView): T => ({
  ...snapshot,
  players: snapshot.players.map(update),
});

// A player the host just added, with the id the board chose for it, so the card is complete and
// usable at once: changes to it queue behind the add (life taps wait out their grouping delay).
export function addPlayerPatch(playerId: string, displayName: string, colorKey: string, position: number): SnapshotPatch {
  return (snapshot) => {
    if (snapshot.players.some((player) => player.id === playerId || player.display_name.toLowerCase() === displayName.toLowerCase())) {
      return snapshot;
    }
    const player: PlayerView = {
      id: playerId,
      position,
      display_name: displayName,
      color_key: colorKey,
      life_total: snapshot.starting_life,
      conceded: false,
      eliminated_override: null,
      eliminated: false,
      elimination_reason: null,
      rejoinable: false,
      manual: true,
    };
    return { ...snapshot, players: [...snapshot.players, player].sort((a, b) => a.position - b.position) };
  };
}

// A stand-in player for sizing an open spot like a real card (never shown or sent).
export function placeholderPlayer(position: number, startingLife: number): PlayerView {
  return {
    id: `spot-${position}`,
    position,
    display_name: "Player",
    color_key: "artifact",
    life_total: startingLife,
    conceded: false,
    eliminated_override: null,
    eliminated: false,
    elimination_reason: null,
    rejoinable: false,
    manual: true,
  };
}

export function editPlayerPatch(playerId: string, change: { display_name?: string; color_key?: string }): SnapshotPatch {
  return (snapshot) => mapPlayers(snapshot, (player) => (player.id === playerId ? { ...player, ...change } : player));
}

export function removePlayerPatch(playerId: string): SnapshotPatch {
  return (snapshot) => ({ ...snapshot, players: snapshot.players.filter((player) => player.id !== playerId) });
}

// Absolute positions (captured when the drag ends), so re-applying after the server swapped is a no-op.
export function positionsPatch(positions: Record<string, number>): SnapshotPatch {
  return (snapshot) =>
    mapPlayers(snapshot, (player) => (positions[player.id] !== undefined ? { ...player, position: positions[player.id] } : player));
}

export function setupPatch(change: { starting_life?: number; max_players?: number }): SnapshotPatch {
  return (snapshot) => {
    let next = snapshot;
    if (change.starting_life !== undefined && change.starting_life !== snapshot.starting_life) {
      // Same rule as the server: every total moves by the difference.
      const difference = change.starting_life - snapshot.starting_life;
      next = mapPlayers({ ...next, starting_life: change.starting_life }, (player) => ({
        ...player,
        life_total: Math.min(LIFE_MAX, Math.max(LIFE_MIN, player.life_total + difference)),
      }));
    }
    if (change.max_players !== undefined && change.max_players !== snapshot.max_players) {
      // Same rule as the server: the host's last layout for the new count, else its first layout.
      const preferences = (next as Partial<HostSnapshot>).layout_preferences ?? {};
      const board_layout = resolveLayout(preferences[String(change.max_players)], change.max_players).key;
      next = { ...next, max_players: change.max_players, board_layout };
    }
    return next;
  };
}

export function commanderDamagePatch(enabled: boolean): SnapshotPatch {
  return (snapshot) => ({ ...snapshot, commander_damage_enabled: enabled });
}

export function guestManagementPatch(enabled: boolean): SnapshotPatch {
  return (snapshot) => ({ ...snapshot, guests_manage_players: enabled });
}

// Also remembered as the host's layout for this count, as the server does.
export function layoutPatch(layoutKey: string): SnapshotPatch {
  return (snapshot) => {
    const preferences = (snapshot as Partial<HostSnapshot>).layout_preferences;
    if (!preferences) return { ...snapshot, board_layout: layoutKey };
    return { ...snapshot, board_layout: layoutKey, layout_preferences: { ...preferences, [String(snapshot.max_players)]: layoutKey } };
  };
}

// Same rule as the server: closing joining before the game starts it; during the game joining
// opens and closes without leaving it.
export function joiningPatch(open: boolean): SnapshotPatch {
  return (snapshot) => {
    if (snapshot.status === "lobby") return open ? snapshot : { ...snapshot, status: "active", joining_open: false };
    if (snapshot.status === "active") return { ...snapshot, joining_open: open };
    return snapshot;
  };
}

// Same rule as the server: starting life for everyone, no commander damage, nobody out.
export function resetPatch(): SnapshotPatch {
  return (snapshot) => ({
    ...snapshot,
    commander_damage: [],
    players: snapshot.players.map((player) => ({
      ...player,
      life_total: snapshot.starting_life,
      conceded: false,
      eliminated_override: null,
      eliminated: false,
      elimination_reason: null,
    })),
  });
}

export function statusPatch(status: SessionStatus): SnapshotPatch {
  return (snapshot) => ({ ...snapshot, status });
}
