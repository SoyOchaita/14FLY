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
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
