import express from "express";
import { auth } from "../middleware/auth.js";
import {
  getCancellationHistory,
  getCancellationStats,
  getReservationAuditTrail,
  getDetailedCancellationReport,
} from "../controllers/auditLog.controller.js";

const router = express.Router();

/**
 * GET /api/audit/cancellations
 * Obtener historial de cancelaciones del usuario autenticado
 * Query params: ?limit=50&offset=0&action=cancelled
 */
router.get("/cancellations", auth, getCancellationHistory);

/**
 * GET /api/audit/cancellations/stats
 * Obtener estadísticas de cancelaciones del usuario
 */
router.get("/cancellations/stats", auth, getCancellationStats);

/**
 * GET /api/audit/reservations/:id/trail
 * Obtener trail de auditoría completo de una reserva específica
 */
router.get("/reservations/:id/trail", auth, getReservationAuditTrail);

/**
 * GET /api/audit/cancellations/report/detailed
 * Obtener reporte detallado de cancelaciones con análisis
 * Query params: ?limit=50&offset=0
 */
router.get("/cancellations/report/detailed", auth, getDetailedCancellationReport);

export default router;
