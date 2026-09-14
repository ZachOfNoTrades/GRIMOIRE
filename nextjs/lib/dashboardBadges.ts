import { ModuleBadge, ModuleBadgeMap } from "@/types/dashboardBadge";
import { getDamnationBadges } from "@/app/modules/damnation/lib/badgeFunctions";
import { getForageBadges } from "@/app/modules/forage/lib/badgeFunctions";
import { getGolemBadges } from "@/app/modules/golem/lib/badgeFunctions";
import { getQuestBadges } from "@/app/modules/quest/lib/badgeFunctions";
import { getRuneBadges } from "@/app/modules/rune/lib/badgeFunctions";

// Fans out to each module's badge builder and merges the results into one slug-keyed map for the
// homepage cards. Each module owns its own predicates (and its own database), so the only thing
// living here is the fan-out.
//
// Badges are decoration: one module's DB being unreachable must not blank the whole dashboard, so
// every builder is isolated — a rejection logs and contributes an empty list. Modules with nothing
// to report are omitted entirely rather than mapped to [].

const BUILDERS: Record<string, (userId: string) => Promise<ModuleBadge[]>> = {
  damnation: getDamnationBadges,
  forage: getForageBadges,
  golem: getGolemBadges,
  quest: getQuestBadges,
  rune: getRuneBadges,
};

export async function getDashboardBadges(userId: string): Promise<ModuleBadgeMap> {
  const slugs = Object.keys(BUILDERS);
  const settled = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return await BUILDERS[slug](userId);
      } catch (error) {
        console.error(`Error building dashboard badges for module '${slug}':`, error);
        return [];
      }
    })
  );

  const map: ModuleBadgeMap = {};
  slugs.forEach((slug, index) => {
    if (settled[index].length > 0) map[slug] = settled[index];
  });
  return map;
}
