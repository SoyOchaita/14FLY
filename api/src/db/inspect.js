import { pool } from "./pool.js";

const schema = process.env.DB_SCHEMA || "public";

async function main() {
  try {
    const { rows } = await pool.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = $1
          AND data_type IN ('timestamp without time zone','timestamp with time zone')
        ORDER BY table_name, column_name`,
      [schema]
    );

    console.log("Timestamp columns:");
    for (const r of rows) {
      console.log(`- ${r.table_name}.${r.column_name}: ${r.data_type}`);
    }
  } catch (err) {
    console.error("inspect error:", err);
  } finally {
    pool.end();
  }
}

main();
