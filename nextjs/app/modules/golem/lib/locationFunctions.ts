import sql from 'mssql';
import { getGolemConnection, closeGolemConnection } from './db';
import type {
  ActiveLocationEquipment,
  Equipment,
  EquipmentOption,
  Location,
  LocationEquipmentSelection,
  LocationWithEquipment,
} from '../types/location';

// =============================
// Equipment / options (taxonomy)
// =============================

export async function listEquipment(): Promise<Equipment[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    // image_data itself is never selected here — this feeds the equipment list JSON
    // response, and a VARBINARY(MAX) blob per row would bloat that payload. The photo
    // is fetched separately, per equipment, via /api/equipment/[id]/image.
    const result = await pool.request().query(`
      SELECT id, name, category, has_options, sort_order,
        CASE WHEN image_data IS NOT NULL THEN 1 ELSE 0 END AS has_image
      FROM equipment
      WHERE is_disabled = 0
      ORDER BY sort_order, name
    `);
    return result.recordset.map((r) => ({ ...r, has_options: !!r.has_options, has_image: !!r.has_image }));
  } catch (error) {
    console.error('Error fetching equipment:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Raw image bytes for one equipment item (PNG). Null if it has no photo.
export async function getEquipmentImage(equipmentId: string): Promise<Buffer | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('equipmentId', sql.UniqueIdentifier, equipmentId)
      .query(`SELECT image_data FROM equipment WHERE id = @equipmentId`);
    if (result.recordset.length === 0) return null;
    return result.recordset[0].image_data ?? null;
  } catch (error) {
    console.error('Error fetching equipment image:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

export async function listEquipmentOptions(): Promise<EquipmentOption[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT id, equipment_id, label, value_kg, sort_order
      FROM equipment_options
      ORDER BY equipment_id, sort_order, label
    `);
    return result.recordset.map((r) => ({
      ...r,
      value_kg: r.value_kg === null || r.value_kg === undefined ? null : Number(r.value_kg),
    }));
  } catch (error) {
    console.error('Error fetching equipment options:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// The valid equipment categories, mirroring the EquipmentCategory union in ../types/location.
// Used to validate writes to the equipment taxonomy (create/update).
const EQUIPMENT_CATEGORIES = [
  'small_weights',
  'bars_and_plates',
  'benches_and_racks',
  'cable_machines',
  'strength_machines',
  'resistance_bands',
  'cardio_machines',
  'bodyweight',
  'other',
] as const;

// Creates a new equipment item in the global taxonomy. Equipment is not user-scoped — it is shared
// library metadata that exercises require and locations stock. No delete counterpart is exposed;
// retiring an item is a soft is_disabled flip done elsewhere, never a hard delete.
export async function createEquipment(
  name: string,
  category: string,
  hasOptions: boolean = false,
  sortOrder: number = 0,
): Promise<Equipment> {
  if (!(EQUIPMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Invalid equipment category: '${category}'`);
  }
  let pool;
  try {
    pool = await getGolemConnection();
    // image_data is intentionally not settable here — photos are uploaded separately via the
    // per-equipment image route, matching how listEquipment surfaces has_image rather than bytes.
    const result = await pool.request()
      .input('name', name)
      .input('category', category)
      .input('hasOptions', hasOptions ? 1 : 0)
      .input('sortOrder', sortOrder)
      .query(`
        INSERT INTO equipment (name, category, has_options, sort_order)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.category, INSERTED.has_options, INSERTED.sort_order
        VALUES (@name, @category, @hasOptions, @sortOrder)
      `);
    const row = result.recordset[0];
    return { ...row, has_options: !!row.has_options, has_image: false };
  } catch (error) {
    console.error('Error creating equipment:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Updates an equipment item's editable taxonomy fields (name, category, has_options, sort_order).
// is_disabled is deliberately not touched here — there is no delete path through this function.
export async function updateEquipment(
  equipmentId: string,
  name: string,
  category: string,
  hasOptions: boolean,
  sortOrder: number,
): Promise<Equipment> {
  if (!(EQUIPMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Invalid equipment category: '${category}'`);
  }
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('equipmentId', sql.UniqueIdentifier, equipmentId)
      .input('name', name)
      .input('category', category)
      .input('hasOptions', hasOptions ? 1 : 0)
      .input('sortOrder', sortOrder)
      .query(`
        UPDATE equipment
        SET name = @name, category = @category, has_options = @hasOptions,
            sort_order = @sortOrder, modified_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.category, INSERTED.has_options, INSERTED.sort_order,
          CASE WHEN INSERTED.image_data IS NOT NULL THEN 1 ELSE 0 END AS has_image
        WHERE id = @equipmentId
      `);
    if (result.recordset.length === 0) {
      throw new Error(`No equipment found for id: '${equipmentId}'`);
    }
    const row = result.recordset[0];
    return { ...row, has_options: !!row.has_options, has_image: !!row.has_image };
  } catch (error) {
    console.error('Error updating equipment:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// =============================
// Locations
// =============================

// Normalizes a raw locations recordset row into the Location shape (BIT → boolean).
function mapLocationRow(r: any): Location {
  return {
    id: r.id,
    name: r.name,
    is_active: !!r.is_active,
    is_warmup_active: !!r.is_warmup_active,
    is_default: !!r.is_default,
    bodyweight_only: !!r.bodyweight_only,
    sort_order: r.sort_order,
  };
}

export async function listLocations(userId: string): Promise<Location[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT id, name, is_active, is_warmup_active, is_default, bodyweight_only, sort_order
        FROM locations
        WHERE user_id = @userId
        ORDER BY is_active DESC, is_default DESC, sort_order, name
      `);
    return result.recordset.map(mapLocationRow);
  } catch (error) {
    console.error('Error listing locations:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

export async function getLocationWithEquipment(
  userId: string,
  locationId: string,
): Promise<LocationWithEquipment> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Location row (scoped to user)
    const locResult = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('locationId', sql.UniqueIdentifier, locationId)
      .query(`
        SELECT id, name, is_active, is_warmup_active, is_default, bodyweight_only, sort_order
        FROM locations
        WHERE id = @locationId AND user_id = @userId
      `);
    if (locResult.recordset.length === 0) {
      throw new Error(`No location found for id: '${locationId}'`);
    }
    const loc = locResult.recordset[0];

    // Selections: one row per location_equipment, with options aggregated
    const selResult = await pool.request()
      .input('locationId', sql.UniqueIdentifier, locationId)
      .query(`
        SELECT
          le.equipment_id,
          leo.equipment_option_id
        FROM location_equipment le
        LEFT JOIN location_equipment_options leo
          ON leo.location_equipment_id = le.id
        WHERE le.location_id = @locationId
      `);

    const map = new Map<string, string[]>();
    for (const row of selResult.recordset) {
      const eqId: string = row.equipment_id;
      if (!map.has(eqId)) map.set(eqId, []);
      if (row.equipment_option_id) map.get(eqId)!.push(row.equipment_option_id);
    }
    const selections: LocationEquipmentSelection[] = Array.from(map.entries()).map(
      ([equipment_id, option_ids]) => ({ equipment_id, option_ids }),
    );

    return {
      ...mapLocationRow(loc),
      selections,
    };
  } catch (error) {
    console.error('Error fetching location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

export async function createLocation(userId: string, name: string): Promise<Location> {
  let pool;
  try {
    pool = await getGolemConnection();

    // If the user has no locations yet, the new one becomes both active and the default.
    const countResult = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`SELECT COUNT(*) AS n FROM locations WHERE user_id = @userId`);
    const isFirst = countResult.recordset[0].n === 0;

    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(100), name)
      .input('isActive', sql.Bit, isFirst ? 1 : 0)
      .input('isDefault', sql.Bit, isFirst ? 1 : 0)
      .query(`
        INSERT INTO locations (user_id, name, is_active, is_default)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.is_active, INSERTED.is_warmup_active, INSERTED.is_default, INSERTED.bodyweight_only, INSERTED.sort_order
        VALUES (@userId, @name, @isActive, @isDefault)
      `);
    return mapLocationRow(result.recordset[0]);
  } catch (error) {
    console.error('Error creating location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

export async function renameLocation(
  userId: string,
  locationId: string,
  name: string,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('locationId', sql.UniqueIdentifier, locationId)
      .input('name', sql.NVarChar(100), name)
      .query(`
        UPDATE locations
        SET name = @name, modified_at = GETDATE()
        WHERE id = @locationId AND user_id = @userId
      `);
    if (result.rowsAffected[0] === 0) {
      throw new Error(`No location found for id: '${locationId}'`);
    }
  } catch (error) {
    console.error('Error renaming location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

export async function deleteLocation(userId: string, locationId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      // Verify ownership and guard the default location (every user always keeps one).
      const owns = await transaction.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`SELECT is_default FROM locations WHERE id = @locationId AND user_id = @userId`);
      if (owns.recordset.length === 0) {
        throw new Error(`No location found for id: '${locationId}'`);
      }
      if (owns.recordset[0].is_default) {
        throw new Error('Cannot delete the default location');
      }

      // Cascade-delete exercise overrides, equipment options, equipment rows, then the location.
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`DELETE FROM location_exercise_overrides WHERE location_id = @locationId`);
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`
          DELETE leo
          FROM location_equipment_options leo
          JOIN location_equipment le ON le.id = leo.location_equipment_id
          WHERE le.location_id = @locationId
        `);
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`DELETE FROM location_equipment WHERE location_id = @locationId`);
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`DELETE FROM locations WHERE id = @locationId`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

export async function setActiveLocation(
  userId: string,
  locationId: string | null,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      // Clear any existing active flag for this user
      await transaction.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`UPDATE locations SET is_active = 0 WHERE user_id = @userId AND is_active = 1`);

      if (locationId) {
        const result = await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('locationId', sql.UniqueIdentifier, locationId)
          .query(`
            UPDATE locations
            SET is_active = 1, modified_at = GETDATE()
            WHERE id = @locationId AND user_id = @userId
          `);
        if (result.rowsAffected[0] === 0) {
          throw new Error(`No location found for id: '${locationId}'`);
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error setting active location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// =============================
// Equipment selections for a location
// =============================

export async function setLocationEquipment(
  userId: string,
  locationId: string,
  selections: LocationEquipmentSelection[],
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Verify ownership first (outside transaction to keep the txn tight)
    const owns = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('locationId', sql.UniqueIdentifier, locationId)
      .query(`SELECT 1 AS owned FROM locations WHERE id = @locationId AND user_id = @userId`);
    if (owns.recordset.length === 0) {
      throw new Error(`No location found for id: '${locationId}'`);
    }

    // For has_options=1 equipment whose option_ids[] is empty, default to all options.
    const equipmentMeta = await pool.request().query(`
      SELECT id, has_options FROM equipment WHERE is_disabled = 0
    `);
    const hasOptionsMap = new Map<string, boolean>();
    for (const r of equipmentMeta.recordset) hasOptionsMap.set(r.id, !!r.has_options);

    const allOptions = await pool.request().query(`
      SELECT id, equipment_id FROM equipment_options
    `);
    const optionsByEquipment = new Map<string, string[]>();
    for (const r of allOptions.recordset) {
      if (!optionsByEquipment.has(r.equipment_id)) optionsByEquipment.set(r.equipment_id, []);
      optionsByEquipment.get(r.equipment_id)!.push(r.id);
    }

    const normalized: { equipment_id: string; option_ids: string[] }[] = [];
    for (const sel of selections) {
      const isOpt = hasOptionsMap.get(sel.equipment_id);
      if (isOpt === undefined) {
        throw new Error(`Unknown equipment id: '${sel.equipment_id}'`);
      }
      if (isOpt) {
        const opts = sel.option_ids.length > 0
          ? sel.option_ids
          : (optionsByEquipment.get(sel.equipment_id) ?? []);
        // If still empty (no options seeded), treat the equipment as off.
        if (opts.length === 0) continue;
        normalized.push({ equipment_id: sel.equipment_id, option_ids: opts });
      } else {
        normalized.push({ equipment_id: sel.equipment_id, option_ids: [] });
      }
    }

    const transaction = pool.transaction();
    await transaction.begin();
    try {
      // Wipe existing selections
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`
          DELETE leo
          FROM location_equipment_options leo
          JOIN location_equipment le ON le.id = leo.location_equipment_id
          WHERE le.location_id = @locationId
        `);
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`DELETE FROM location_equipment WHERE location_id = @locationId`);

      // Insert new selections
      for (const sel of normalized) {
        const insertResult = await transaction.request()
          .input('locationId', sql.UniqueIdentifier, locationId)
          .input('equipmentId', sql.UniqueIdentifier, sel.equipment_id)
          .query(`
            INSERT INTO location_equipment (location_id, equipment_id)
            OUTPUT INSERTED.id
            VALUES (@locationId, @equipmentId)
          `);
        const leId: string = insertResult.recordset[0].id;
        for (const optId of sel.option_ids) {
          await transaction.request()
            .input('locationEquipmentId', sql.UniqueIdentifier, leId)
            .input('equipmentOptionId', sql.UniqueIdentifier, optId)
            .query(`
              INSERT INTO location_equipment_options (location_equipment_id, equipment_option_id)
              VALUES (@locationEquipmentId, @equipmentOptionId)
            `);
        }
      }

      // Bump modified_at on the parent so UI can sort
      await transaction.request()
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`UPDATE locations SET modified_at = GETDATE() WHERE id = @locationId`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error setting location equipment:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// =============================
// Active location (for LLM / picker)
// =============================

export async function getActiveLocation(userId: string): Promise<Location | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1 id, name, is_active, is_warmup_active, is_default, bodyweight_only, sort_order
        FROM locations
        WHERE user_id = @userId AND is_active = 1
      `);
    if (result.recordset.length === 0) return null;
    return mapLocationRow(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching active location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Returns the user's default location, creating one if none exists. Every user always
// has exactly one default location — it is the fallback used when no location is active
// and it cannot be deleted. If the user already has locations but somehow none is marked
// default (legacy data), the active-or-first location is promoted to default.
export async function getOrCreateDefaultLocation(userId: string): Promise<Location> {
  let pool;
  try {
    pool = await getGolemConnection();

    const existing = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1 id, name, is_active, is_warmup_active, is_default, bodyweight_only, sort_order
        FROM locations
        WHERE user_id = @userId AND is_default = 1
      `);
    if (existing.recordset.length > 0) return mapLocationRow(existing.recordset[0]);

    // Promote an existing location (prefer active, else first) to default if any exist.
    const promote = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE locations
        SET is_default = 1, modified_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.is_active, INSERTED.is_warmup_active, INSERTED.is_default, INSERTED.bodyweight_only, INSERTED.sort_order
        WHERE id = (
          SELECT TOP 1 id FROM locations
          WHERE user_id = @userId
          ORDER BY is_active DESC, sort_order, name
        )
      `);
    if (promote.recordset.length > 0) return mapLocationRow(promote.recordset[0]);

    // No locations at all — create the default (also active so generation has a context).
    const created = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(100), 'Default')
      .query(`
        INSERT INTO locations (user_id, name, is_active, is_default)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.is_active, INSERTED.is_warmup_active, INSERTED.is_default, INSERTED.bodyweight_only, INSERTED.sort_order
        VALUES (@userId, @name, 1, 1)
      `);
    return mapLocationRow(created.recordset[0]);
  } catch (error) {
    console.error('Error getting or creating default location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Resolves which location's settings apply for the user right now. An explicit, owned
// location id wins; otherwise the active location; otherwise the default (created on demand).
// This is the single entry point for "which location's enabled-exercise list / bodyweight
// mode should I use" across reads and writes.
export async function resolveLocationId(
  userId: string,
  explicitLocationId?: string | null,
): Promise<string> {
  if (explicitLocationId) {
    let pool;
    try {
      pool = await getGolemConnection();
      const owns = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('locationId', sql.UniqueIdentifier, explicitLocationId)
        .query(`SELECT 1 AS owned FROM locations WHERE id = @locationId AND user_id = @userId`);
      if (owns.recordset.length > 0) return explicitLocationId;
    } finally {
      if (pool) await closeGolemConnection(pool);
    }
    throw new Error(`No location found for id: '${explicitLocationId}'`);
  }

  const active = await getActiveLocation(userId);
  if (active) return active.id;
  const fallback = await getOrCreateDefaultLocation(userId);
  return fallback.id;
}

// Marks a location as the user's default (clearing the previous default). Transactional so
// the one-default-per-user filtered index is never transiently violated.
export async function setDefaultLocation(userId: string, locationId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await transaction.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`UPDATE locations SET is_default = 0 WHERE user_id = @userId AND is_default = 1`);

      const result = await transaction.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('locationId', sql.UniqueIdentifier, locationId)
        .query(`
          UPDATE locations
          SET is_default = 1, modified_at = GETDATE()
          WHERE id = @locationId AND user_id = @userId
        `);
      if (result.rowsAffected[0] === 0) {
        throw new Error(`No location found for id: '${locationId}'`);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error setting default location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Toggles bodyweight-only mode for a location. When on, session generation prescribes only
// bodyweight movements and the location's selected equipment is ignored.
export async function setBodyweightOnly(
  userId: string,
  locationId: string,
  bodyweightOnly: boolean,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('locationId', sql.UniqueIdentifier, locationId)
      .input('bodyweightOnly', sql.Bit, bodyweightOnly ? 1 : 0)
      .query(`
        UPDATE locations
        SET bodyweight_only = @bodyweightOnly, modified_at = GETDATE()
        WHERE id = @locationId AND user_id = @userId
      `);
    if (result.rowsAffected[0] === 0) {
      throw new Error(`No location found for id: '${locationId}'`);
    }
  } catch (error) {
    console.error('Error setting bodyweight-only mode:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// =============================
// Warmup location (separate pointer for warmup exercise selection)
// =============================

// Returns the user's active WARMUP location, or null when none is set (warmups then
// use the working/active location). Lets warmups be sourced from a different place
// than working sets — e.g. warm up at home, train at the gym.
export async function getActiveWarmupLocation(userId: string): Promise<Location | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1 id, name, is_active, is_warmup_active, is_default, bodyweight_only, sort_order
        FROM locations
        WHERE user_id = @userId AND is_warmup_active = 1
      `);
    if (result.recordset.length === 0) return null;
    return mapLocationRow(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching active warmup location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Sets (or clears, with null) the user's active warmup location. Transactional so the
// one-warmup-active-per-user filtered index is never transiently violated.
export async function setActiveWarmupLocation(
  userId: string,
  locationId: string | null,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      // Clear any existing warmup flag for this user
      await transaction.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`UPDATE locations SET is_warmup_active = 0 WHERE user_id = @userId AND is_warmup_active = 1`);

      if (locationId) {
        const result = await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('locationId', sql.UniqueIdentifier, locationId)
          .query(`
            UPDATE locations
            SET is_warmup_active = 1, modified_at = GETDATE()
            WHERE id = @locationId AND user_id = @userId
          `);
        if (result.rowsAffected[0] === 0) {
          throw new Error(`No location found for id: '${locationId}'`);
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error setting active warmup location:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// =============================
// LLM prompt formatting
// =============================

// Builds the markdown equipment/enabled-exercise section for a single location.
// `role` controls the heading + which exercises it governs:
//   'all'     → one combined location (warmup === working)
//   'working' → governs WORKING exercises (is_warmup=false)
//   'warmup'  → governs WARMUP exercises (is_warmup=true)
function formatLocationSection(data: ActiveLocationEquipment, role: 'all' | 'working' | 'warmup'): string[] {
  const heading =
    role === 'working' ? '## Working Equipment (for WORKING exercises, is_warmup=false)'
    : role === 'warmup' ? '## Warmup Equipment (for WARMUP exercises, is_warmup=true)'
    : '## Available Equipment';
  const scope =
    role === 'working' ? 'working (is_warmup=false)'
    : role === 'warmup' ? 'warmup (is_warmup=true)'
    : 'all';

  const lines: string[] = [heading, ''];
  lines.push(`Location: ${data.location.name} (id: ${data.location.id})`);
  lines.push('');

  if (data.location.bodyweight_only) {
    lines.push('This location is **BODYWEIGHT ONLY**. Prescribe only bodyweight movements (and unweighted mobility/warmups). Assume NO equipment is available — set `weight` to 0.');
  } else {
    lines.push('Only choose exercises that can be performed with the equipment listed below, and stay within the available weight range. Bodyweight exercises are always allowed.');
    lines.push('');
    for (const item of data.items) {
      if (item.equipment.has_options && item.options.length > 0) {
        const labels = item.options.map((o) => o.label).join(', ');
        lines.push(`- ${item.equipment.name} (${labels})`);
      } else {
        lines.push(`- ${item.equipment.name}`);
      }
    }
  }

  // Per-location enabled-exercise constraint for the SQL Query skill.
  lines.push('');
  lines.push('### Enabled Exercises (per-location)');
  const applies = scope === 'all' ? 'all exercises' : `${scope} exercises`;
  lines.push(`For ${applies}, only prescribe exercises ENABLED at this location. An exercise is disabled here when \`location_exercise_overrides\` has a row with \`location_id = '${data.location.id}'\`, the exercise's id, and \`is_disabled = 1\`. When discovering these exercises, \`LEFT JOIN location_exercise_overrides leo ON leo.exercise_id = e.id AND leo.location_id = '${data.location.id}'\` and require \`COALESCE(leo.is_disabled, 0) = 0\`.`);
  return lines;
}

// Formats the active location(s)' equipment + enabled-exercise lists as a markdown
// section to inject into the LLM session-generation prompt. Returns empty string when
// no working location is active (preserves prior "assume commercial gym" behavior).
// When a separate warmup location is active, emits two sections so the LLM sources
// warmup exercises from one location and working exercises from another.
export async function formatLocationEquipmentForPrompt(userId: string): Promise<string> {
  const working = await getActiveLocationEquipment(userId).catch(() => null);
  if (!working) return '';

  const warmupLocation = await getActiveWarmupLocation(userId).catch(() => null);
  const hasSeparateWarmup = !!warmupLocation && warmupLocation.id !== working.location.id;

  if (!hasSeparateWarmup) {
    return formatLocationSection(working, 'all').join('\n');
  }

  const warmup = await getLocationEquipment(userId, warmupLocation!.id).catch(() => null);
  const sections: string[] = [
    'Warmup and working exercises use DIFFERENT locations. Apply each section only to the exercise type it names.',
    '',
    ...formatLocationSection(working, 'working'),
    '',
    ...(warmup ? formatLocationSection(warmup, 'warmup') : []),
  ];
  return sections.join('\n');
}

export async function getActiveLocationEquipment(
  userId: string,
): Promise<ActiveLocationEquipment | null> {
  const location = await getActiveLocation(userId);
  if (!location) return null;
  return getLocationEquipment(userId, location.id);
}

// Loads a specific owned location plus its selected equipment + options.
export async function getLocationEquipment(
  userId: string,
  locationId: string,
): Promise<ActiveLocationEquipment | null> {
  let pool;
  try {
    pool = await getGolemConnection();

    const locResult = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('locationId', sql.UniqueIdentifier, locationId)
      .query(`
        SELECT id, name, is_active, is_warmup_active, is_default, bodyweight_only, sort_order
        FROM locations
        WHERE id = @locationId AND user_id = @userId
      `);
    if (locResult.recordset.length === 0) return null;
    const location = mapLocationRow(locResult.recordset[0]);

    const result = await pool.request()
      .input('locationId', sql.UniqueIdentifier, location.id)
      .query(`
        SELECT
          e.id          AS equipment_id,
          e.name        AS equipment_name,
          e.category    AS equipment_category,
          CASE WHEN e.image_data IS NOT NULL THEN 1 ELSE 0 END AS equipment_has_image,
          e.has_options AS equipment_has_options,
          e.sort_order  AS equipment_sort_order,
          eo.id          AS option_id,
          eo.label       AS option_label,
          eo.value_kg    AS option_value_kg,
          eo.sort_order  AS option_sort_order
        FROM location_equipment le
        JOIN equipment e ON e.id = le.equipment_id
        LEFT JOIN location_equipment_options leo ON leo.location_equipment_id = le.id
        LEFT JOIN equipment_options eo ON eo.id = leo.equipment_option_id
        WHERE le.location_id = @locationId
        ORDER BY e.sort_order, e.name, eo.sort_order, eo.label
      `);

    const byEquipment = new Map<string, ActiveLocationEquipment['items'][number]>();
    for (const r of result.recordset) {
      let item = byEquipment.get(r.equipment_id);
      if (!item) {
        item = {
          equipment: {
            id: r.equipment_id,
            name: r.equipment_name,
            category: r.equipment_category,
            has_image: !!r.equipment_has_image,
            has_options: !!r.equipment_has_options,
            sort_order: r.equipment_sort_order,
          },
          options: [],
        };
        byEquipment.set(r.equipment_id, item);
      }
      if (r.option_id) {
        item.options.push({
          id: r.option_id,
          equipment_id: r.equipment_id,
          label: r.option_label,
          value_kg: r.option_value_kg === null || r.option_value_kg === undefined
            ? null
            : Number(r.option_value_kg),
          sort_order: r.option_sort_order,
        });
      }
    }

    return { location, items: Array.from(byEquipment.values()) };
  } catch (error) {
    console.error('Error fetching active location equipment:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}
