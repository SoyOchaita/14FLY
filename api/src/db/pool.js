import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();
const { Pool, types } = pkg;

// Normalize PostgreSQL timestamp parsing to ISO 8601 strings with timezone (UTC Z)
// OID 1114: timestamp without time zone
types.setTypeParser(1114, (val) => (val ? new Date(val + "Z").toISOString() : null));
// OID 1184: timestamp with time zone
types.setTypeParser(1184, (val) => (val ? new Date(val).toISOString() : null));

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

console.log("✅ Conexión a PostgreSQL lista");
