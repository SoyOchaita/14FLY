import { pool } from "../db/pool.js";

/**
 * Clase AuditLog para gestionar la bitácora de auditoría de reservas
 * Registra todas las acciones (crear, modificar, cancelar, restaurar)
 * en la tabla reservation_audit
 */
export class AuditLog {
  /**
   * Registra una acción en la auditoría
   * @param {number} userId - ID del usuario
   * @param {number} reservationId - ID de la reserva
   * @param {string} action - Tipo de acción ('created', 'modified', 'cancelled', 'restored')
   * @param {object} options - Opciones adicionales
   * @param {string} options.reason - Razón de la acción (ej: "Cancelación por cambio de planes")
   * @param {object} options.details - Detalles en formato JSON (cambios realizados)
   * @param {string} options.ipAddress - Dirección IP del cliente
   * @param {string} options.userAgent - User Agent del navegador/cliente
   */
  static async log(userId, reservationId, action, options = {}) {
    try {
      const { reason = null, details = null, ipAddress = null, userAgent = null } = options;

      const result = await pool.query(
        `INSERT INTO reservation_audit(user_id, reservation_id, action, action_reason, details, ip_address, user_agent, cancelled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING audit_id, cancelled_at`,
        [
          userId,
          reservationId,
          action,
          reason,
          details ? JSON.stringify(details) : null,
          ipAddress,
          userAgent || null,
        ]
      );

      console.log(`[AUDIT] User #${userId} - Reservation #${reservationId} - Action: ${action}`);
      return result.rows[0];
    } catch (err) {
      console.error(`[AUDIT ERROR] No se pudo registrar auditoría: ${err.message}`);
      throw err;
    }
  }

  /**
   * Obtiene el historial de cancelaciones de un usuario
   * @param {number} userId - ID del usuario
   * @param {object} filters - Filtros opcionales
   * @param {number} filters.limit - Número de registros a retornar
   * @param {number} filters.offset - Desplazamiento para paginación
   * @param {string} filters.action - Filtrar por tipo de acción
   */
  static async getUserCancellationHistory(userId, filters = {}) {
    try {
      const { limit = 50, offset = 0, action = 'cancelled' } = filters;

      let query = `
        SELECT 
          ra.audit_id,
          ra.reservation_id,
          ra.action,
          ra.action_reason,
          ra.cancelled_at,
          s.seat_number,
          s.seat_class,
          p.full_name AS passenger_name,
          p.cui,
          r.price_base,
          r.discount,
          r.total_price,
          r.reservation_date AS original_reservation_date,
          ra.details
        FROM reservation_audit ra
        JOIN reservations r ON r.reservation_id = ra.reservation_id
        LEFT JOIN seats s ON s.seat_id = r.seat_id
        LEFT JOIN passengers p ON p.passenger_id = r.passenger_id
        WHERE ra.user_id = $1 AND ra.action = $2
        ORDER BY ra.cancelled_at DESC
        LIMIT $3 OFFSET $4
      `;

      const result = await pool.query(query, [userId, action, limit, offset]);

      // Obtener total de registros para paginación
      const countQuery = `
        SELECT COUNT(*)::int as total
        FROM reservation_audit
        WHERE user_id = $1 AND action = $2
      `;
      const countResult = await pool.query(countQuery, [userId, action]);
      const total = countResult.rows[0]?.total || 0;

      return {
        data: result.rows,
        pagination: {
          total,
          limit,
          offset,
          page: Math.floor(offset / limit) + 1,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error(`[AUDIT] Error obteniendo historial: ${err.message}`);
      throw err;
    }
  }

  /**
   * Obtiene un resumen de auditoría para una reserva específica
   * @param {number} reservationId - ID de la reserva
   */
  static async getReservationAuditTrail(reservationId) {
    try {
      const result = await pool.query(
        `SELECT 
          ra.audit_id,
          ra.action,
          ra.action_reason,
          ra.cancelled_at,
          ra.details,
          u.full_name AS user_name,
          u.email
        FROM reservation_audit ra
        JOIN users u ON u.user_id = ra.user_id
        WHERE ra.reservation_id = $1
        ORDER BY ra.cancelled_at ASC`,
        [reservationId]
      );

      return result.rows;
    } catch (err) {
      console.error(`[AUDIT] Error obteniendo trail de auditoría: ${err.message}`);
      throw err;
    }
  }

  /**
   * Obtiene estadísticas de cancelaciones de un usuario
   * @param {number} userId - ID del usuario
   */
  static async getUserCancellationStats(userId) {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*)::int as total_cancellations,
          COUNT(DISTINCT DATE(ra.cancelled_at))::int as cancellation_dates,
          SUM((r.total_price)::numeric)::numeric as total_amount_cancelled,
          AVG((r.total_price)::numeric)::numeric as avg_cancellation_amount,
          MAX(ra.cancelled_at) as last_cancellation,
          MIN(ra.cancelled_at) as first_cancellation
        FROM reservation_audit ra
        JOIN reservations r ON r.reservation_id = ra.reservation_id
        WHERE ra.user_id = $1 AND ra.action = 'cancelled'`,
        [userId]
      );

      return result.rows[0] || {
        total_cancellations: 0,
        cancellation_dates: 0,
        total_amount_cancelled: 0,
        avg_cancellation_amount: 0,
        last_cancellation: null,
        first_cancellation: null,
      };
    } catch (err) {
      console.error(`[AUDIT] Error obteniendo estadísticas: ${err.message}`);
      throw err;
    }
  }

  /**
   * Restaura una reserva cancelada (deshacer cancelación)
   * @param {number} userId - ID del usuario
   * @param {number} reservationId - ID de la reserva
   */
  static async restoreCancelledReservation(userId, reservationId) {
    try {
      // Verificar que la reserva existe y fue cancelada
      const checkQuery = `
        SELECT ra.audit_id FROM reservation_audit
        WHERE user_id = $1 AND reservation_id = $2 AND action = 'cancelled'
        ORDER BY cancelled_at DESC LIMIT 1
      `;
      const checkResult = await pool.query(checkQuery, [userId, reservationId]);
      
      if (!checkResult.rows.length) {
        throw new Error(
          'No se encontró una cancelación registrada para esta reserva'
        );
      }

      // Registrar restauración
      return await this.log(userId, reservationId, 'restored', {
        reason: 'Restauración de reserva cancelada',
        details: {
          restored_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error(`[AUDIT] Error restaurando reserva: ${err.message}`);
      throw err;
    }
  }
}
