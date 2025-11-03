import { pool } from "../db/pool.js";
import { ok, HttpError } from "../utils/response.js";

export const createReservation = async (req, res) => {
  try {
    const { seat_id, passenger_id, has_luggage = false, price_base } = req.body;
    const uid = req.user.id;
    if (!seat_id || !price_base) throw new HttpError("Datos incompletos", 400);

    const seatQ = await pool.query("SELECT is_occupied FROM seats WHERE seat_id=$1", [seat_id]);
    if (!seatQ.rows.length) throw new HttpError("Asiento no existe", 404);
    if (seatQ.rows[0].is_occupied) throw new HttpError("Asiento no disponible", 400);

    // VIP descuento 10%
    const { rows: r } = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
    const vip = (r[0]?.cnt || 0) >= 5;
    let total = Number(price_base);
    if (vip) total = total * 0.9;

    const ins = await pool.query(
      "INSERT INTO reservations(user_id, seat_id, passenger_id, has_luggage, price_base, total_price) VALUES($1,$2,$3,$4,$5,$6) RETURNING reservation_id",
      [uid, seat_id, passenger_id || null, !!has_luggage, price_base, total]
    );
    await pool.query("UPDATE seats SET is_occupied=true WHERE seat_id=$1", [seat_id]);
    return ok(res, "Reserva creada", { reservation_id: ins.rows[0].reservation_id, total, vip });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const getMyReservations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM reservations WHERE user_id=$1 ORDER BY reservation_date DESC",
      [req.user.id]
    );
    return ok(res, "Mis reservas", result.rows);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { seat_id, price_base } = req.body;
    const uid = req.user.id;
    const { rows } = await pool.query("SELECT * FROM reservations WHERE reservation_id=$1 AND user_id=$2", [id, uid]);
    if (!rows.length) throw new HttpError("Reserva no encontrada", 404);

    const prev = rows[0];
    let total = Number(price_base ?? prev.price_base);
    const seatChanged = seat_id && Number(seat_id) !== prev.seat_id;
    if (seatChanged) {
      // +10% por cambio de asiento
      total = total * 1.10;
      // Validar nuevo asiento disponible
      const seatQ = await pool.query("SELECT is_occupied FROM seats WHERE seat_id=$1", [seat_id]);
      if (!seatQ.rows.length) throw new HttpError("Asiento no existe", 404);
      if (seatQ.rows[0].is_occupied) throw new HttpError("Asiento no disponible", 400);
    }

    // VIP descuento 10%
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
    const vip = (r.rows[0]?.cnt || 0) >= 5;
    if (vip) total = total * 0.9;

    await pool.query(
      "UPDATE reservations SET seat_id=COALESCE($1, seat_id), price_base=COALESCE($2, price_base), total_price=$3 WHERE reservation_id=$4",
      [seat_id || null, price_base || null, total, id]
    );
    if (seatChanged) {
      await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [prev.seat_id]);
      await pool.query("UPDATE seats SET is_occupied=true WHERE seat_id=$1", [seat_id]);
    }

    return ok(res, "Reserva actualizada", { reservation_id: Number(id), total, seatChanged, vip });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;
    const { rows } = await pool.query("SELECT seat_id FROM reservations WHERE reservation_id=$1 AND user_id=$2", [id, uid]);
    if (!rows.length) throw new HttpError("Reserva no encontrada", 404);
    const seatId = rows[0].seat_id;
    await pool.query("DELETE FROM reservations WHERE reservation_id=$1", [id]);
    await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [seatId]);
    return ok(res, "Reserva cancelada", { reservation_id: Number(id) });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};
