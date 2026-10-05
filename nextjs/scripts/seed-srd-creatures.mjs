// Load the bundled SRD creatures into oracle_creatures. Safe to re-run: a creature already there
// is updated rather than duplicated. The shared library rows have no user_id.
import { readFile } from "node:fs/promises";
import path from "node:path";
import sql from "mssql";

const DATA = path.join(process.cwd(), "app/modules/oracle/data/srdCreatures.json");

async function main() {
  const creatures = JSON.parse(await readFile(DATA, "utf8"));
  const pool = await sql.connect({
    server: process.env.SQL_SERVER_URL,
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    database: process.env.SQL_MAIN_DB,
    options: { encrypt: false, trustServerCertificate: true },
  });

  let added = 0;
  let updated = 0;
  for (const creature of creatures) {
    const result = await pool
      .request()
      .input("slug", creature.slug)
      .input("name", creature.name)
      .input("source", creature.source)
      .input("license", creature.license_url)
      .input("url", creature.source_url ?? null)
      .input("size", creature.size)
      .input("type", creature.type)
      .input("alignment", creature.alignment)
      .input("cr", creature.cr)
      .input("details", creature.details)
      .input("stats", JSON.stringify(creature.stats))
      .query(`
        MERGE oracle_creatures AS target
        USING (SELECT @slug AS slug) AS source ON target.slug = source.slug AND target.user_id IS NULL
        WHEN MATCHED THEN UPDATE SET name = @name, official_source = @source, license_url = @license,
          size = @size, creature_type = @type, alignment = @alignment, cr = @cr, details = @details, stats = @stats, source_url = @url
        WHEN NOT MATCHED THEN INSERT (slug, name, official_source, license_url, size, creature_type, alignment, cr, details, stats, source_url)
          VALUES (@slug, @name, @source, @license, @size, @type, @alignment, @cr, @details, @stats, @url)
        OUTPUT $action;
      `);
    if (result.recordset[0].$action === "INSERT") added += 1;
    else updated += 1;
  }

  const total = await pool.request().query("SELECT COUNT(*) AS n FROM oracle_creatures WHERE user_id IS NULL");
  console.log(`added ${added}, updated ${updated}, library now ${total.recordset[0].n}`);
  await pool.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
