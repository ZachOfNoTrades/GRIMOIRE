import { getMainConnection } from "@/lib/db";
import { Module } from "@/types/module";

// Per-user module access (allow-list) backed by dbo.user_modules.
//
// Access rule (kept here, NOT in SQL):
//   * A global_admin always sees every enabled module.
//   * A user with ZERO grant rows is UNCONFIGURED -> gets EVERY enabled module.
//     This is the "for now give everyone everything" default: the table starts
//     empty so existing users keep full access.
//   * A user with one or more grant rows is RESTRICTED to exactly those modules.
// Because empty == full access, "access to zero modules" is intentionally not
// representable (a user with no modules is not a supported state).

// The set of enabled module ids a user has been explicitly granted. Empty set
// means "unconfigured" (full access), which callers interpret via getModulesForUser.
async function getGrantedModuleIds(userId: string): Promise<string[]> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", userId)
    .query<{ module_id: string }>(
      `SELECT um.module_id
       FROM user_modules um
       INNER JOIN modules m ON m.id = um.module_id
       WHERE um.user_id = @userId AND m.enabled = 1`
    );

  return result.recordset.map((row) => row.module_id);
}

// Modules the given user may access, ordered by name. Global admins and
// unconfigured users get every enabled module; restricted users get their subset.
export async function getModulesForUser(
  userId: string,
  globalAdmin: boolean
): Promise<Module[]> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .query<Module>(
      `SELECT id, name, slug, description, icon, enabled, ts_created, ts_updated
       FROM modules
       WHERE enabled = 1
       ORDER BY name`
    );

  const modules = result.recordset;
  if (result.recordset.length === 0) {
    console.warn("No modules found");
  }

  // Admins bypass the allow-list entirely.
  if (globalAdmin) {
    return modules;
  }

  const grantedModuleIds = await getGrantedModuleIds(userId);

  // Unconfigured user (no grants) -> full access.
  if (grantedModuleIds.length === 0) {
    return modules;
  }

  // Restricted user -> only granted modules.
  const grantedSet = new Set(grantedModuleIds);
  return modules.filter((module) => grantedSet.has(module.id));
}

// Whether a user may access a single module by slug. Reusable server-side guard
// for future per-module route enforcement (dashboard filtering already uses
// getModulesForUser). Global admins and unconfigured users always pass.
export async function userCanAccessModule(
  userId: string,
  slug: string,
  globalAdmin: boolean
): Promise<boolean> {
  const modules = await getModulesForUser(userId, globalAdmin);
  return modules.some((module) => module.slug === slug);
}

// Admin view of a user's module access: every enabled module plus which ones the
// user currently has, and whether they are in the default full-access state.
export async function getUserModuleAccess(userId: string): Promise<{
  modules: Module[];
  grantedModuleIds: string[];
  allAccess: boolean;
}> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .query<Module>(
      `SELECT id, name, slug, description, icon, enabled, ts_created, ts_updated
       FROM modules
       WHERE enabled = 1
       ORDER BY name`
    );

  const modules = result.recordset;
  const grantedModuleIds = await getGrantedModuleIds(userId);
  const allAccess = grantedModuleIds.length === 0;

  return {
    // When unconfigured, surface every module as "granted" so the admin UI shows
    // the true effective state (full access) with all boxes checked.
    grantedModuleIds: allAccess ? modules.map((module) => module.id) : grantedModuleIds,
    modules,
    allAccess,
  };
}

// Replace a user's module grants with exactly the given module ids. Selecting all
// enabled modules (or none) collapses back to the empty default full-access state
// so the common "give everyone everything" case never accumulates rows.
export async function setUserModuleAccess(
  userId: string,
  moduleIds: string[]
): Promise<void> {
  const pool = await getMainConnection();

  // Resolve the set of enabled module ids so we can validate + detect "all".
  const modulesResult = await pool
    .request()
    .query<{ id: string }>(`SELECT id FROM modules WHERE enabled = 1`);
  const enabledModuleIds = new Set(modulesResult.recordset.map((row) => row.id));

  // Keep only valid, enabled, de-duplicated ids.
  const selected = [...new Set(moduleIds)].filter((id) => enabledModuleIds.has(id));

  // Selecting every enabled module (or nothing) == default full access -> no rows.
  const isFullAccess = selected.length === 0 || selected.length === enabledModuleIds.size;

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    await transaction
      .request()
      .input("userId", userId)
      .query(`DELETE FROM user_modules WHERE user_id = @userId`);

    if (!isFullAccess) {
      for (const moduleId of selected) {
        await transaction
          .request()
          .input("userId", userId)
          .input("moduleId", moduleId)
          .query(
            `INSERT INTO user_modules (user_id, module_id) VALUES (@userId, @moduleId)`
          );
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error("Error setting user module access:", error);
    throw error;
  }
}
