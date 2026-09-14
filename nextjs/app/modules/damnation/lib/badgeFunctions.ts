import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import { ModuleBadge } from "@/types/dashboardBadge";

// Homepage badge for the Damnation card: "Game live" while the user is hosting a game that
// hasn't ended, so a board closed by accident is one tap away. Idle games past the expiry
// window don't count — they are finished on their next lookup.
export async function getDamnationBadges(userId: string): Promise<ModuleBadge[]> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query<{ live: number; players: number }>(`
      SELECT COUNT(DISTINCT s.id) AS live, COUNT(p.id) AS players
      FROM damnation_sessions s
      LEFT JOIN damnation_players p ON p.session_id = s.id AND p.kicked = 0
      WHERE s.host_user_id = @userId
        AND s.status <> 'finished'
        AND s.ts_updated >= DATEADD(HOUR, -12, GETDATE())
    `);

  const { live, players } = result.recordset[0] ?? { live: 0, players: 0 };
  if (live === 0) return [];
  return [
    {
      key: "damnation-live",
      label: live === 1 ? "Game live" : `${live} games live`,
      tone: "blue",
      detail: `You're hosting ${live === 1 ? "a game" : `${live} games`} with ${players} player${players === 1 ? "" : "s"} in the game`,
    },
  ];
}
