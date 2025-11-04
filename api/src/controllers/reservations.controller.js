import { pool } from "../db/pool.js";
import { randomUUID } from "crypto";
import { ok, HttpError } from "../utils/response.js";
import { validateCUI, validateFullName } from "../utils/validators.js";

// POST /api/reservations
// Body: { seats: [{ code, full_name, cui, has_bag }] }
export const createReservation = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { seats, quantity, seatClass, selectionMode, seatsData } = req.body || {};

  await client.query("BEGIN");
  const batchId = (req.body && req.body.batch_id) ? String(req.body.batch_id) : randomUUID();
    const created = [];

    // Caso 1: payload con arreglo de seats [{ code, full_name, cui, has_bag }]
    if (Array.isArray(seats) && seats.length > 0) {
      for (const s of seats) {
        const code = String(s.code || "").trim();
        const fullName = String(s.full_name || "").trim();
        const cui = String(s.cui || "").replace(/[\-\s]/g, "");
        const hasBag = !!s.has_bag;
        if (!code || !fullName || !cui) throw new HttpError("Cada asiento debe incluir code, full_name y cui.", 400);
        // Validaciones antes de tocar la BD: nombre y CUI
        const normalizedName = validateFullName(fullName); // lanza 400 si inválido
        if (!validateCUI(cui)) throw new HttpError(`CUI inválido para el asiento ${code}.`, 400);

        const seatRes = await client.query(
          `UPDATE seats SET is_occupied=true
           WHERE seat_number=$1 AND is_occupied=false
           RETURNING seat_id, seat_number`,
          [code]
        );
        if (!seatRes.rows.length) throw new HttpError(`Asiento ${code} no disponible.`, 409);
        const { seat_id, seat_number } = seatRes.rows[0];

        const paxRes = await client.query(
          `INSERT INTO passengers(full_name, cui)
           VALUES ($1, $2)
           ON CONFLICT (cui) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING passenger_id`,
          [normalizedName, cui]
        );

        const ins = await client.query(
          `INSERT INTO reservations(user_id, seat_id, passenger_id, has_luggage, price_base, discount, modification_fee, total_price, batch_id)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, $5)
           RETURNING reservation_id, reservation_date`,
          [uid, seat_id, paxRes.rows[0].passenger_id, hasBag, batchId]
        );

        created.push({ reservation_id: ins.rows[0].reservation_id, seat_code: seat_number, created_at: ins.rows[0].reservation_date, batch_id: batchId });
      }
    }
    // Caso 2: selección aleatoria por clase y cantidad
  else if (selectionMode === "random") {
      const cls = String(seatClass || "").toLowerCase();
      if (!quantity || !["business", "economy"].includes(cls)) {
        throw new HttpError("Faltan datos requeridos para selección aleatoria (quantity y seatClass).", 400);
      }
      const dbClass = cls === "business" ? "Negocios" : "Económica";
      const passengers = Array.isArray(seatsData) ? seatsData : [];
      if (passengers.length < Number(quantity)) {
        throw new HttpError("Debe proporcionar datos de pasajero para cada asiento solicitado (seatsData).", 400);
      }

      for (let i = 0; i < Number(quantity); i++) {
        const p = passengers[i];
  const fullName = String(p.full_name || "").trim();
        const cui = String(p.cui || "").replace(/[\-\s]/g, "");
        const hasBag = !!p.has_bag;
  if (!fullName || !cui) throw new HttpError("Cada pasajero debe incluir full_name y cui.", 400);
  const normalizedName = validateFullName(fullName);
  if (!validateCUI(cui)) throw new HttpError(`CUI inválido para el pasajero #${i + 1}.`, 400);

        // Selección y marcado atómico del asiento aleatorio disponible
        const seatPick = await client.query(
          `WITH picked AS (
             SELECT seat_id FROM seats
              WHERE seat_class=$1 AND is_occupied=false
              ORDER BY RANDOM()
              LIMIT 1
           )
           UPDATE seats s SET is_occupied=true
            FROM picked
            WHERE s.seat_id = picked.seat_id AND s.is_occupied=false
            RETURNING s.seat_id, s.seat_number`,
          [dbClass]
        );
        if (!seatPick.rows.length) throw new HttpError("No hay asientos disponibles.", 409);
        const { seat_id, seat_number } = seatPick.rows[0];

        const paxRes = await client.query(
          `INSERT INTO passengers(full_name, cui)
           VALUES ($1, $2)
           ON CONFLICT (cui) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING passenger_id`,
          [normalizedName, cui]
        );

        const ins = await client.query(
          `INSERT INTO reservations(user_id, seat_id, passenger_id, has_luggage, price_base, discount, modification_fee, total_price, batch_id)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, $5)
           RETURNING reservation_id, reservation_date`,
          [uid, seat_id, paxRes.rows[0].passenger_id, hasBag, batchId]
        );

        created.push({ reservation_id: ins.rows[0].reservation_id, seat_code: seat_number, created_at: ins.rows[0].reservation_date, batch_id: batchId });
      }
    } else {
      throw new HttpError("Estructura de solicitud inválida. Proporcione 'seats' o 'selectionMode=random' con 'quantity' y 'seatClass'.", 400);
    }

    await client.query("COMMIT");
    return res.json({ success: true, message: "Reservas realizadas correctamente.", data: created, batch_id: batchId });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  } finally {
    client.release();
  }
};

export const getMyReservations = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const result = await pool.query(
      `SELECT r.reservation_id, r.reservation_date AS created_at,
              s.seat_number AS seat_code, s.seat_class,
              p.full_name, p.cui,
              r.has_luggage AS has_bag,
              r.batch_id
         FROM reservations r
         JOIN seats s ON s.seat_id = r.seat_id
         JOIN passengers p ON p.passenger_id = r.passenger_id
        WHERE r.user_id = $1
        ORDER BY r.reservation_date DESC`,
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
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const { id } = req.params;
    const { seat_id, price_base, has_luggage, full_name, cui } = req.body;
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

    // Si vienen datos de pasajero, validar y preparar actualización
    let newPassengerId = null;
    if (full_name || cui) {
      const normalizedName = full_name ? validateFullName(full_name) : null;
      const cleanCui = cui ? String(cui).replace(/[\s\-]/g, "") : null;
      if (cleanCui && !validateCUI(cleanCui)) {
        throw new HttpError("CUI inválido.", 400);
      }
      // Upsert de pasajero y tomar el passenger_id
      const paxRes = await pool.query(
        `INSERT INTO passengers(full_name, cui)
         VALUES ($1, COALESCE($2, (SELECT cui FROM passengers WHERE passenger_id=$3)))
         ON CONFLICT (cui) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, passengers.full_name)
         RETURNING passenger_id`,
        [normalizedName || null, cleanCui, prev.passenger_id]
      );
      newPassengerId = paxRes.rows[0].passenger_id;
    }

    await pool.query(
      "UPDATE reservations SET seat_id=COALESCE($1, seat_id), price_base=COALESCE($2, price_base), has_luggage=COALESCE($3, has_luggage), total_price=$4, passenger_id=COALESCE($5, passenger_id) WHERE reservation_id=$6",
      [seat_id || null, price_base || null, typeof has_luggage === 'boolean' ? has_luggage : null, total, newPassengerId, id]
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

// GET /api/reservations/:id/quote?seat_id=&price_base=&has_luggage=
export const quoteReservation = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const { id } = req.params;
    const uid = req.user.id;
    const seat_id = req.query.seat_id ? Number(req.query.seat_id) : undefined;
    const price_base = req.query.price_base ? Number(req.query.price_base) : undefined;
    const has_luggage = typeof req.query.has_luggage !== 'undefined' ? req.query.has_luggage === 'true' : undefined;

    const { rows } = await pool.query("SELECT * FROM reservations WHERE reservation_id=$1 AND user_id=$2", [id, uid]);
    if (!rows.length) throw new HttpError("Reserva no encontrada", 404);
    const prev = rows[0];

    let total = Number(price_base ?? prev.price_base ?? 0);
    const seatChanged = seat_id && Number(seat_id) !== prev.seat_id;
    if (seatChanged) {
      total = total * 1.10; // 10% por cambio de asiento
      // Validar que el asiento potencial esté libre
      const seatQ = await pool.query("SELECT is_occupied FROM seats WHERE seat_id=$1", [seat_id]);
      if (!seatQ.rows.length) throw new HttpError("Asiento no existe", 404);
      if (seatQ.rows[0].is_occupied) throw new HttpError("Asiento no disponible", 400);
    }

    // VIP descuento 10% por historial
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
    const vip = (r.rows[0]?.cnt || 0) >= 5;
    if (vip) total = total * 0.9;

    // Nota: has_luggage no afecta total actualmente; se incluye para futura lógica.
    return ok(res, "Cotización de cambio", { reservation_id: Number(id), total, seatChanged: !!seatChanged, vip, has_luggage: typeof has_luggage === 'boolean' ? has_luggage : undefined });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const cancelReservation = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
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
