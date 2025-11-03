import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/pool.js";
import userRoutes from "./route/users.routes.js";
import seatRoutes from "./route/seats.routes.js";
import reservationRoutes from "./route/reservations.routes.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/reservations", reservationRoutes);

app.get("/", (req, res) => res.send("🛫 API 14FLY en ejecución"));

// Health endpoint para monitoreo
app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () =>
	console.log(`✅ API corriendo en http://${HOST}:${PORT}`)
);

server.on("listening", () => {
	const addr = server.address();
	console.log("👂 Escuchando en:", addr);
});

server.on("error", (err) => {
	console.error("🚨 Error del servidor:", err.code || err.message, err);
});

// Loguea errores no manejados para diagnosticar cierres inesperados
process.on("unhandledRejection", (reason, promise) => {
	console.error("🔥 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
	console.error("💥 Uncaught Exception:", err);
});

process.on("SIGINT", () => {
	console.log("📴 Señal SIGINT recibida. Cerrando servidor...");
	server.close(() => {
		console.log("✅ Servidor cerrado limpiamente");
		process.exit(0);
	});
});
