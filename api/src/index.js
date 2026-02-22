import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { pool } from "./db/pool.js";
import reportsRoutes from "./routes/reports.routes.js";
import { xmlBodyParser } from "./controllers/reports.controller.js";
import { errorHandler } from "./middleware/errorHandler.js";
import userRoutes from "./routes/users.routes.js";
import seatRoutes from "./routes/seats.routes.js";
import reservationRoutes from "./routes/reservations.routes.js";
import configRoutes from "./routes/config.routes.js";
import auditLogRoutes from "./routes/auditLog.routes.js";
import { getTransporter, sendMail, renderTemplate } from "./utils/mailer.js";

// Cargar variables de entorno con tolerancia a monorepo: intenta múltiples ubicaciones
(() => {
  // 1) carga por defecto (cwd)
  dotenv.config();
  // 2) intenta rutas conocidas relativas al cwd
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
    path.resolve(process.cwd(), 'api', '.env'),
    path.resolve(process.cwd(), '..', 'api', '.env'),
  ];
  let loaded = 0;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const r = dotenv.config({ path: p, override: false });
        if (!r.error) loaded++;
      }
    } catch { /* ignore */ }
  }
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    console.log(chalk.gray(`[env] .env files loaded: ${loaded}`));
  }
})();

// =======================================
// CONFIGURACIÓN BASE
// =======================================
const app = express();
app.use(cors());
app.use(express.json());
// Body parser para XML sólo en rutas que lo requieren
app.use('/api/reports/reservations.xml/upload', xmlBodyParser);

// Log de admins configurados (solo en desarrollo) para depuración de roles
if ((process.env.NODE_ENV || 'development') !== 'production') {
  const adminsRaw = String(process.env.ADMIN_EMAILS || '').trim();
  const adminsList = adminsRaw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  console.log(chalk.gray(`[admin] ADMIN_EMAILS: ${adminsList.length} usuario(s) configurado(s)`));
}

// Utilidad local para escapar HTML en fragmentos dinámicos
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Resolver adjuntos (logo) si existe un path configurado
function getLogoAttachment() {
  const configuredPath = process.env.MAIL_LOGO_PATH ? String(process.env.MAIL_LOGO_PATH) : null;
  if (!configuredPath) return null;
  try {
    const absolute = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
    if (fs.existsSync(absolute)) {
      const filename = path.basename(absolute);
      return { filename, path: absolute, cid: 'logo' };
    }
  } catch (_) { /* ignore */ }
  return null;
}

// =======================================
// RUTAS
// =======================================
app.use("/api/users", userRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/config", configRoutes);
app.use("/api/audit", auditLogRoutes);

// Endpoints de salud
app.get("/", (req, res) => res.send("🛫 API 14FLY en ejecución"));
app.get("/health", (req, res) => res.json({ success: true, message: "ok", data: { timestamp: new Date().toISOString(), uptime: process.uptime() } }));
app.get("/health/email", async (req, res) => {
  const cfg = {
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false',
    hasAuth: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    from: process.env.MAIL_FROM || null
  };
  // Si no hay HOST definido, reportar como no configurado (200) para no romper despliegues
  if (!cfg.host) {
    return res.json({ success: true, message: "email: not-configured", data: { configured: false, ...cfg } });
  }
  try {
    const transporter = getTransporter();
    const ok = await transporter.verify();
    return res.json({ success: true, message: ok ? "email: ready" : "email: unknown", data: { configured: true, verified: !!ok, ...cfg } });
  } catch (e) {
    return res.status(503).json({ success: false, message: "email: verify-failed", data: { configured: true, error: e.message, ...cfg } });
  }
});



// =======================================
// VARIABLES DE ENTORNO
// =======================================
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "localhost";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || "flydb";
const ENV = process.env.NODE_ENV || "development";

// =======================================
// INICIO DEL SERVIDOR
// =======================================
app.listen(PORT, HOST, async () => {
  console.clear();

  // Intentar validar la conexión a PostgreSQL
  let dbStatus = chalk.red("❌ Error");
  try {
    await pool.query("SELECT 1");
    // Crear tabla de actividad si no existe (para métricas del panel admin)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservation_activity (
        activity_id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        reservation_id INT,
        type TEXT NOT NULL CHECK (type IN ('created','modified','cancelled')),
        selection_mode TEXT CHECK (selection_mode IN ('manual','random')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_user ON reservation_activity(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_type ON reservation_activity(type);
      CREATE INDEX IF NOT EXISTS idx_activity_created_at ON reservation_activity(created_at);
    `);
    dbStatus = chalk.green("✅ Conectada");
  } catch (err) {
    console.error(chalk.red("Error de conexión a la base de datos:"), err.message);
  }

  // Detectar si corre en Docker
  const isDocker = process.env.DOCKER_ENV === "true";

  // =======================================
  // LOG ESTRUCTURADO DE ESTADO DEL SERVIDOR
  // =======================================
  console.log(chalk.bold.cyan("=============================================="));
  console.log(chalk.bold.green("🚀  SERVIDOR 14FLY EN EJECUCIÓN"));
  console.log(chalk.gray("----------------------------------------------"));
  console.log(`${chalk.white("🌐  URL:")} ${chalk.bold.blue(`http://${HOST}:${PORT}`)}`);
  console.log(`${chalk.white("🧭  Modo:")} ${ENV === "development" ? chalk.yellow("Desarrollo") : chalk.green("Producción")}`);
  console.log(`${chalk.white("🗄️  Base de datos:")} ${chalk.yellow(DB_NAME)} ${chalk.gray(`(${DB_HOST}:${DB_PORT})`)}`);
  console.log(`${chalk.white("🔌  Estado conexión DB:")} ${dbStatus}`);
  console.log(chalk.bold.cyan("=============================================="));
});

// Manejo centralizado de errores
app.use(errorHandler);
