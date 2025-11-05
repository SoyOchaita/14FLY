import { pool } from "./pool.js";

const schema = process.env.DB_SCHEMA || "public";
const appTz = process.env.APP_TZ || process.env.TZ || "America/Guatemala";

async function columnType(table, column) {
  const { rows } = await pool.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
    [schema, table, column]
  );
  return rows[0]?.data_type || null;
}

async function migrateColumnToTimestamptz(table, column, setDefaultNow = true) {
  const type = await columnType(table, column);
  if (!type) {
    console.log(`- Skipping: ${table}.${column} not found`);
    return;
  }

  if (type === "timestamp with time zone") {
    console.log(`- OK: ${table}.${column} already timestamptz`);
    return;
  }

  if (type === "timestamp without time zone") {
    console.log(`- Migrating ${table}.${column} to timestamptz using zone '${appTz}'...`);
    const tzLit = appTz.replace(/'/g, "''");
    await pool.query(`ALTER TABLE ${schema}."${table}" ALTER COLUMN "${column}" TYPE timestamptz USING "${column}" AT TIME ZONE '${tzLit}'`);
    if (setDefaultNow) {
      await pool.query(`ALTER TABLE ${schema}."${table}" ALTER COLUMN "${column}" SET DEFAULT NOW()`);
    }
    console.log(`- Done: ${table}.${column} is now timestamptz`);
    return;
  }

  console.log(`- Skipping: ${table}.${column} has unexpected type '${type}'`);
}

async function main() {
  try {
    await migrateColumnToTimestamptz("reservations", "reservation_date", true);
    await migrateColumnToTimestamptz("reservations", "modified_at", true);
    await migrateColumnToTimestamptz("users", "created_at", true);
    // Agregar columnas que usamos si no existen
    await pool.query(`ALTER TABLE ${schema}."reservations" ADD COLUMN IF NOT EXISTS batch_id text`);
    await pool.query(`ALTER TABLE ${schema}."reservations" ADD COLUMN IF NOT EXISTS price_base numeric`);
    await pool.query(`ALTER TABLE ${schema}."reservations" ADD COLUMN IF NOT EXISTS discount numeric`);
    await pool.query(`ALTER TABLE ${schema}."reservations" ADD COLUMN IF NOT EXISTS modification_fee numeric DEFAULT 0`);
    await pool.query(`ALTER TABLE ${schema}."reservations" ADD COLUMN IF NOT EXISTS total_price numeric`);

    // Backfill de precios base y totales para reservas antiguas
    const business = Number(process.env.BUSINESS_PRICE || 1500);
    const economy = Number(process.env.ECONOMY_PRICE || 500);
    await pool.query(
    `UPDATE ${schema}."reservations" r
      SET price_base = CASE WHEN s.seat_class = 'Negocios' THEN $1::numeric ELSE $2::numeric END
        FROM ${schema}."seats" s
       WHERE r.seat_id = s.seat_id
         AND (r.price_base IS NULL OR r.price_base = 0)`,
      [business, economy]
    );
    await pool.query(`UPDATE ${schema}."reservations" SET modification_fee = 0 WHERE modification_fee IS NULL`);
    await pool.query(`UPDATE ${schema}."reservations" SET total_price = price_base WHERE (total_price IS NULL OR total_price = 0) AND price_base IS NOT NULL`);
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
