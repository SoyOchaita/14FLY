import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chalk from "chalk";
import { pool } from "./db/pool.js";
import reportsRoutes from "./routes/reports.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import userRoutes from "./routes/users.routes.js";
import seatRoutes from "./routes/seats.routes.js";
import reservationRoutes from "./routes/reservations.routes.js";
import configRoutes from "./routes/config.routes.js";
import { getTransporter, sendMail, renderTemplate } from "./utils/mailer.js";

dotenv.config();

// =======================================
// CONFIGURACIÓN BASE
// =======================================
const app = express();
app.use(cors());
app.use(express.json());

// =======================================
// RUTAS
// =======================================
app.use("/api/users", userRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/config", configRoutes);

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

// Envío de prueba (solo no-producción). Útil para validar Mailtrap.
app.get("/health/email/test", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  try {
    const html = renderTemplate({
      title: 'Prueba SMTP 14FLY',
      intro: 'Este es un correo de prueba para validar la configuración SMTP.',
      contentHtml: '<p>Si estás usando Mailtrap, revisa tu inbox de Mailtrap.</p>'
    });
    await sendMail({ to, subject: 'Prueba SMTP 14FLY', html, text: 'Correo de prueba SMTP 14FLY.' });
    return res.json({ success: true, message: 'email: test-sent', data: { to } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: test-failed', data: { to, error: e.message } });
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
