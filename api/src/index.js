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

// Endpoints de salud
app.get("/", (req, res) => res.send("🛫 API 14FLY en ejecución"));
app.get("/health", (req, res) => res.json({ success: true, message: "ok", data: { timestamp: new Date().toISOString(), uptime: process.uptime() } }));

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
  console.log(`${chalk.white("🐳  Docker:")} ${isDocker ? chalk.green("Activo") : chalk.gray("No detectado")}`);
  console.log(`${chalk.white("🗄️  Base de datos:")} ${chalk.yellow(DB_NAME)} ${chalk.gray(`(${DB_HOST}:${DB_PORT})`)}`);
  console.log(`${chalk.white("🔌  Estado conexión DB:")} ${dbStatus}`);
  console.log(chalk.bold.cyan("=============================================="));
});

// Manejo centralizado de errores
app.use(errorHandler);
