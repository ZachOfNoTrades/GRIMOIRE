import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { normUnit, unitTypeOf, UNIT_TYPES } from './unitFamilies';
import { FoodUnit, UnitType, CUSTOM_UNIT_MAX_LEN, CUSTOM_UNIT_ORDER_BASE } from '../types/unit';

export type { FoodUnit };

interface UnitRow {
  id: string;
  name: string;
  unit_type?: string | null;
  display_order: number;
}

function mapBuiltIn(r: UnitRow): FoodUnit {
  return {
    id: r.id,
    name: r.name,
    // Built-ins carry no stored type — the conversion tables already know
    // whether 'cup' is volume and 'slice' isn't.
    type: unitTypeOf(r.name),
    display_order: Number(r.display_order),
    is_custom: false,
  };
}

function mapCustom(r: UnitRow): FoodUnit {
  const stored = (r.unit_type ?? 'count') as UnitType;
  return {
    id: r.id,
    name: r.name,
    type: UNIT_TYPES.includes(stored) ? stored : 'count',
    display_order: Number(r.display_order),
    is_custom: true,
  };
}

// Every unit `userId` may select: the shared built-in catalog first, then their own
// custom units. Called without a userId (background parsers with no session) it
// returns the built-ins only.
export async function listUnits(userId?: string | null): Promise<FoodUnit[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .query<UnitRow>(
        `SELECT id, name, display_order
         FROM food_units
         ORDER BY display_order ASC, name ASC`
      );
    if (result.recordset.length === 0) {
      console.warn(`No units found in food_units`);
    }
    const builtIns = result.recordset.map(mapBuiltIn);
    if (!userId) return builtIns;

    const custom = await listUserUnits(userId);
    // A custom unit whose name collides with a built-in would render twice; the
    // built-in wins (create/update already reject collisions, this guards old rows).
    const taken = new Set(builtIns.map((u) => normUnit(u.name)));
    return [...builtIns, ...custom.filter((u) => !taken.has(normUnit(u.name)))];
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// A user's own custom units, in display order. Empty is a normal state.
export async function listUserUnits(userId: string): Promise<FoodUnit[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<UnitRow>(
        `SELECT id, name, unit_type, display_order
         FROM forage_user_units
         WHERE user_id = @userId
         ORDER BY display_order ASC, name ASC`
      );
    // No console.warn on empty — having zero custom units is the default state
    // for every user, not an anomaly worth logging on each dropdown render.
    return result.recordset.map(mapCustom);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Thrown for the user-correctable failures (blank name, too long, duplicate) so the
// API layer can turn them into a 400 with the message instead of a 500.
export class UnitValidationError extends Error {}

function cleanName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!trimmed) throw new UnitValidationError('A unit name is required');
  if (trimmed.length > CUSTOM_UNIT_MAX_LEN) {
    throw new UnitValidationError(`Unit names are limited to ${CUSTOM_UNIT_MAX_LEN} characters`);
  }
  return trimmed;
}

// Absent/null means "unspecified" and defaults to the count bucket; anything else
// that isn't one of the three type strings is a client bug, not a default.
function cleanType(type: unknown): UnitType {
  if (type === undefined || type === null) return 'count';
  if (typeof type !== 'string') {
    throw new UnitValidationError("Unit type must be 'mass', 'volume' or 'count'");
  }
  const t = type.trim().toLowerCase() as UnitType;
  if (!UNIT_TYPES.includes(t)) {
    throw new UnitValidationError("Unit type must be 'mass', 'volume' or 'count'");
  }
  return t;
}

// Duplicate-detection key for a unit name. normUnit() folds the synonyms it knows
// ('grams' -> 'g'), but its alias table can't cover the plural of a word the user
// just invented, so additionally strip a single trailing 's'. That keeps "sticks"
// from being added next to "stick". Detection only — the typed name is what gets
// stored and displayed, so an over-eager fold costs at most a rename.
function dupeKey(name: string): string {
  const n = normUnit(name);
  return n.length > 2 && n.endsWith('s') ? n.slice(0, -1) : n;
}

// Reject a name that already resolves to a built-in ('grams' -> 'g'), to the implicit
// canonical "serving", or to another of this user's custom units.
async function assertNameFree(
  pool: sql.ConnectionPool,
  userId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  const key = dupeKey(name);
  const builtIns = await pool
    .request()
    .query<{ name: string }>(`SELECT name FROM food_units`);
  const builtInHit = builtIns.recordset.find((r) => dupeKey(r.name) === key);
  if (builtInHit) {
    throw new UnitValidationError(`"${builtInHit.name}" is already a built-in unit`);
  }
  if (dupeKey('serving') === key) {
    throw new UnitValidationError('"serving" is reserved — every food already has one');
  }
  const mine = await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ id: string; name: string }>(
      `SELECT id, name FROM forage_user_units WHERE user_id = @userId`
    );
  const mineHit = mine.recordset.find(
    (r) => dupeKey(r.name) === key && r.id.toLowerCase() !== excludeId?.toLowerCase()
  );
  if (mineHit) {
    throw new UnitValidationError(`You already have a "${mineHit.name}" unit`);
  }
}

// SQL Server's unique-constraint violation numbers. assertNameFree() catches the
// normal duplicate, but two concurrent creates of the same name can both pass that
// check — UQ_forage_user_units_user_name is the backstop, and this maps it back to
// the same user-facing 400 instead of a 500.
const UNIQUE_VIOLATION = new Set([2601, 2627]);

export async function createUserUnit(
  userId: string,
  name: unknown,
  type: unknown
): Promise<FoodUnit> {
  const cleanedName = cleanName(name);
  const cleanedType = cleanType(type);
  let pool;
  try {
    pool = await getFoodConnection();
    await assertNameFree(pool, userId, cleanedName);
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(CUSTOM_UNIT_MAX_LEN), cleanedName)
      .input('unitType', sql.VarChar(8), cleanedType)
      .input('orderBase', sql.Int, CUSTOM_UNIT_ORDER_BASE)
      .query<UnitRow>(
        `DECLARE @inserted TABLE (id UNIQUEIDENTIFIER, name NVARCHAR(32), unit_type VARCHAR(8), display_order INT);
         INSERT INTO forage_user_units (user_id, name, unit_type, display_order)
         OUTPUT INSERTED.id, INSERTED.name, INSERTED.unit_type, INSERTED.display_order INTO @inserted
         SELECT @userId, @name, @unitType,
                @orderBase + ISNULL((SELECT COUNT(*) FROM forage_user_units WHERE user_id = @userId), 0) * 10;
         SELECT id, name, unit_type, display_order FROM @inserted;`
      );
    if (result.recordset.length === 0) {
      throw new Error(`Failed to create custom unit "${cleanedName}"`);
    }
    return mapCustom(result.recordset[0]);
  } catch (error: any) {
    if (UNIQUE_VIOLATION.has(error?.number)) {
      throw new UnitValidationError(`You already have a "${cleanedName}" unit`);
    }
    throw error;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Rename / re-group one of the caller's own custom units. Returns null when the id
// isn't theirs (or doesn't exist) so the API can 404 rather than leak its existence.
export async function updateUserUnit(
  userId: string,
  id: string,
  name: unknown,
  type: unknown
): Promise<FoodUnit | null> {
  const cleanedName = cleanName(name);
  const cleanedType = cleanType(type);
  let pool;
  try {
    pool = await getFoodConnection();
    await assertNameFree(pool, userId, cleanedName, id);
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar(CUSTOM_UNIT_MAX_LEN), cleanedName)
      .input('unitType', sql.VarChar(8), cleanedType)
      .query<UnitRow>(
        `UPDATE forage_user_units
            SET name = @name, unit_type = @unitType
         OUTPUT INSERTED.id, INSERTED.name, INSERTED.unit_type, INSERTED.display_order
          WHERE id = @id AND user_id = @userId;`
      );
    return result.recordset.length > 0 ? mapCustom(result.recordset[0]) : null;
  } catch (error: any) {
    if (UNIQUE_VIOLATION.has(error?.number)) {
      throw new UnitValidationError(`You already have a "${cleanedName}" unit`);
    }
    throw error;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Delete one of the caller's custom units. Serving rows already written with this
// unit keep their text (food_servings stores the name, not a FK) — the dropdowns
// surface an unknown stored unit as a stale option, so nothing is orphaned.
// Returns false when the id isn't theirs.
export async function deleteUserUnit(userId: string, id: string): Promise<boolean> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, id)
      .query(`DELETE FROM forage_user_units WHERE id = @id AND user_id = @userId;`);
    return (result.rowsAffected?.[0] ?? 0) > 0;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// How many of the user's stored food serving rows still reference `name`. Powers the
// "used by N foods" warning before a delete.
export async function countServingsUsingUnit(userId: string, name: string): Promise<number> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(CUSTOM_UNIT_MAX_LEN), name)
      .query<{ c: number }>(
        `SELECT COUNT(*) AS c
           FROM food_servings fs
           JOIN foods f ON f.id = fs.food_id
          WHERE fs.unit = @name AND (f.user_id = @userId OR f.user_id IS NULL);`
      );
    return Number(result.recordset[0]?.c ?? 0);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
