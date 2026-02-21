import { ok, HttpError } from "../utils/response.js";
import { AuditLog } from "../utils/auditLog.js";
import { pool } from "../db/pool.js";

/**
 * GET /api/audit/cancellations
 * Retorna el historial de cancelaciones del usuario autenticado
 */
export const getCancellationHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);

    const limit = Math.min(Number(req.query.limit) || 50, 100); // máx 100
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await AuditLog.getUserCancellationHistory(req.user.id, {
      limit,
      offset,
      action: "cancelled",
    });

    return ok(res, "Historial de cancelaciones", result);
  } catch (err) {
    const status = err.status || 500;
    return res
      .status(status)
      .json({ success: false, message: err.message, data: null });
  }
};

/**
 * GET /api/audit/cancellations/stats
 * Retorna estadísticas de cancelaciones del usuario
 */
export const getCancellationStats = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);

    const stats = await AuditLog.getUserCancellationStats(req.user.id);

    // Formatear output
    const formatted = {
      total_cancellations: stats.total_cancellations || 0,
      unique_dates: stats.cancellation_dates || 0,
      total_amount_cancelled: Number(stats.total_amount_cancelled || 0),
      average_amount: Number(stats.avg_cancellation_amount || 0),
      last_cancellation: stats.last_cancellation || null,
      first_cancellation: stats.first_cancellation || null,
      cancellation_rate: stats.total_cancellations > 0 ? "Se ha registrado actividad" : "Sin cancelaciones",
    };

    return ok(res, "Estadísticas de cancelaciones", formatted);
  } catch (err) {
    const status = err.status || 500;
    return res
      .status(status)
      .json({ success: false, message: err.message, data: null });
  }
};

/**
 * GET /api/audit/reservations/:id/trail
 * Retorna el trail de auditoría completo de una reserva
 */
export const getReservationAuditTrail = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);

    const { id } = req.params;

    // Verificar que la reserva pertenece al usuario
    const checkQuery = await pool.query(
      "SELECT user_id FROM reservations WHERE reservation_id = $1",
      [id]
    );

    if (!checkQuery.rows.length)
      throw new HttpError("Reserva no encontrada", 404);
    if (checkQuery.rows[0].user_id !== req.user.id)
      throw new HttpError("No tienes permiso para ver esta reserva", 403);

    const trail = await AuditLog.getReservationAuditTrail(id);

    return ok(res, "Trail de auditoría de la reserva", trail);
  } catch (err) {
    const status = err.status || 500;
    return res
      .status(status)
      .json({ success: false, message: err.message, data: null });
  }
};

/**
 * GET /api/audit/cancellations/report/detailed
 * Retorna reporte detallado de cancelaciones con contexto
 */
export const getDetailedCancellationReport = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const uid = req.user.id;

    // Obtener info del usuario
    const userQuery = await pool.query(
      "SELECT full_name, email, created_at FROM users WHERE user_id = $1",
      [uid]
    );
    const userData = userQuery.rows[0] || {};

    // Obtener estadísticas
    const stats = await AuditLog.getUserCancellationStats(uid);

    // Obtener historial detallado
    const historyResult = await AuditLog.getUserCancellationHistory(uid, {
      limit,
      offset,
      action: "cancelled",
    });

    // Enriquecer cada cancelación con contexto
    const enrichedCancellations = await Promise.all(
      historyResult.data.map(async (cancellation) => {
        // Obtener información del trail
        const trail = await AuditLog.getReservationAuditTrail(
          cancellation.reservation_id
        );
        const creationEvent = trail.find((t) => t.action === "created");
        const cancellationEvent = trail.find((t) => t.action === "cancelled");

        return {
          audit_id: cancellation.audit_id,
          reservation_id: cancellation.reservation_id,
          seat_code: cancellation.seat_number,
          seat_class: cancellation.seat_class,
          passenger_name: cancellation.passenger_name,
          passenger_cui: cancellation.cui,
          cancellation_reason: cancellation.action_reason || "Sin especificar",
          cancellation_date: cancellation.cancelled_at,
          original_reservation_date: cancellation.original_reservation_date,
          financial_info: {
            price_base: Number(cancellation.price_base || 0),
            discount_applied: Number(cancellation.discount || 0),
            total_paid: Number(cancellation.total_price || 0),
          },
          timeline: {
            created: creationEvent?.cancelled_at || null,
            cancelled: cancellationEvent?.cancelled_at || null,
            days_held: cancellation.original_reservation_date
              ? Math.floor(
                  (new Date(cancellation.cancelled_at) -
                    new Date(cancellation.original_reservation_date)) /
                    (1000 * 60 * 60 * 24)
                )
              : null,
          },
        };
      })
    );

    // Construir reporte
    const report = {
      user_info: {
        user_id: uid,
        full_name: userData.full_name || "Usuario",
        email: userData.email || "—",
        member_since: userData.created_at || null,
      },
      summary: {
        total_cancellations: stats.total_cancellations || 0,
        total_refunded: Number(stats.total_amount_cancelled || 0),
        cancellation_rate: `${
          stats.total_cancellations > 0 ? "Activo" : "Sin historial"
        }`,
        last_cancellation_date: stats.last_cancellation || null,
        earliest_cancellation_date: stats.first_cancellation || null,
      },
      cancellations: enrichedCancellations,
      pagination: historyResult.pagination,
      generated_at: new Date().toISOString(),
    };

    return ok(res, "Reporte detallado de cancelaciones", report);
  } catch (err) {
    const status = err.status || 500;
    return res
      .status(status)
      .json({ success: false, message: err.message, data: null });
  }
};
