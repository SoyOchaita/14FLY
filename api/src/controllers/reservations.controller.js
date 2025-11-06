import { pool } from "../db/pool.js";
import { randomUUID } from "crypto";
import { ok, HttpError } from "../utils/response.js";
import { validateCUI, validateFullName } from "../utils/validators.js";
import nodemailer from "nodemailer";

// Precios base por clase (configurables vía ENV)
const BUSINESS_PRICE = Number(process.env.BUSINESS_PRICE || 1500);
const ECONOMY_PRICE = Number(process.env.ECONOMY_PRICE || 500);
function basePriceForClass(seatClassName) {
  const sc = String(seatClassName || '').toLowerCase();
  return sc.includes('negocio') ? BUSINESS_PRICE : ECONOMY_PRICE;
}

// POST /api/reservations
// Body: { seats: [{ code, full_name, cui, has_bag }] }
export const createReservation = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { seats, quantity, seatClass, selectionMode, seatsData } = req.body || {};

  await client.query("BEGIN");
  // Determinar si el usuario es VIP al momento de crear (se aplica desde el inicio)
  const vipCheck = await client.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
  const vipEligible = (vipCheck.rows[0]?.cnt || 0) >= 5;
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
  // Obtener clase del asiento para fijar precio base
  const seatInfo = await client.query("SELECT seat_class FROM seats WHERE seat_id=$1", [seat_id]);
  const seatClassName = seatInfo.rows[0]?.seat_class || '';
  const priceBase = basePriceForClass(seatClassName);
  const discount = vipEligible ? Math.round(priceBase * 0.10 * 100) / 100 : 0;
  const total = Math.max(0, priceBase - discount);

        const paxRes = await client.query(
          `INSERT INTO passengers(full_name, cui)
           VALUES ($1, $2)
           ON CONFLICT (cui) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING passenger_id`,
          [normalizedName, cui]
        );

        const ins = await client.query(
          `INSERT INTO reservations(user_id, seat_id, passenger_id, has_luggage, price_base, discount, modification_fee, total_price, batch_id)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
           RETURNING reservation_id, reservation_date`,
          [uid, seat_id, paxRes.rows[0].passenger_id, hasBag, priceBase, discount, total, batchId]
        );

  created.push({ reservation_id: ins.rows[0].reservation_id, seat_code: seat_number, created_at: ins.rows[0].reservation_date, batch_id: batchId, total, price_base: priceBase, discount, vip_applied: discount > 0 });
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
  const seatInfo = await client.query("SELECT seat_class FROM seats WHERE seat_id=$1", [seat_id]);
  const seatClassName = seatInfo.rows[0]?.seat_class || '';
  const priceBase = basePriceForClass(seatClassName);
  const discount = vipEligible ? Math.round(priceBase * 0.10 * 100) / 100 : 0;
  const total = Math.max(0, priceBase - discount);

        const paxRes = await client.query(
          `INSERT INTO passengers(full_name, cui)
           VALUES ($1, $2)
           ON CONFLICT (cui) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING passenger_id`,
          [normalizedName, cui]
        );

        const ins = await client.query(
          `INSERT INTO reservations(user_id, seat_id, passenger_id, has_luggage, price_base, discount, modification_fee, total_price, batch_id)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
           RETURNING reservation_id, reservation_date`,
          [uid, seat_id, paxRes.rows[0].passenger_id, hasBag, priceBase, discount, total, batchId]
        );

  created.push({ reservation_id: ins.rows[0].reservation_id, seat_code: seat_number, created_at: ins.rows[0].reservation_date, batch_id: batchId, total, price_base: priceBase, discount, vip_applied: discount > 0 });
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
              r.price_base, r.total_price AS total,
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
    const { seat_id, has_luggage, full_name, cui } = req.body;
    const uid = req.user.id;
    const { rows } = await pool.query("SELECT * FROM reservations WHERE reservation_id=$1 AND user_id=$2", [id, uid]);
    if (!rows.length) throw new HttpError("Reserva no encontrada", 404);

    const prev = rows[0];
    // Obtener clase base de la reserva actual
    const prevSeat = await pool.query("SELECT seat_class FROM seats WHERE seat_id=$1", [prev.seat_id]);
    const prevClass = prevSeat.rows[0]?.seat_class || '';
  let base = basePriceForClass(prevClass);
  const prevFee = Number(prev.modification_fee || 0);
  let total = base + prevFee;
    const seatChanged = seat_id && Number(seat_id) !== prev.seat_id;
    if (seatChanged) {
      // Validar nuevo asiento disponible y clase
      const seatQ = await pool.query("SELECT is_occupied, seat_class FROM seats WHERE seat_id=$1", [seat_id]);
      if (!seatQ.rows.length) throw new HttpError("Asiento no existe", 404);
      if (seatQ.rows[0].is_occupied) throw new HttpError("Asiento no disponible", 400);
      const newClass = seatQ.rows[0].seat_class || '';
      if (String(newClass).toLowerCase() !== String(prevClass).toLowerCase()) {
        throw new HttpError("Solo puede cambiar dentro de la misma clase.", 400);
      }
      // +10% por cambio de asiento (acumulativo)
      total = base + prevFee + (base * 0.10);
    }

    // VIP: aplicar -10% solo una vez por reserva
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
    const vipEligible = (r.rows[0]?.cnt || 0) >= 5;
    const prevDiscount = Number(prev.discount || 0);
    let discount = prevDiscount;
    let discountAdded = 0;
    if (prevDiscount <= 0 && vipEligible) {
      discount = Math.round(base * 0.10 * 100) / 100;
      discountAdded = discount;
    }
    total = Math.max(0, (base + (seatChanged ? prevFee + base * 0.10 : prevFee)) - discount);

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

    const newFee = seatChanged ? prevFee + base * 0.10 : prevFee;
    await pool.query(
      "UPDATE reservations SET seat_id=COALESCE($1, seat_id), price_base=$2, modification_fee=$3, discount=$4, has_luggage=COALESCE($5, has_luggage), total_price=$6, passenger_id=COALESCE($7, passenger_id) WHERE reservation_id=$8",
      [seat_id || null, base, newFee, discount, typeof has_luggage === 'boolean' ? has_luggage : null, total, newPassengerId, id]
    );
    if (seatChanged) {
      await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [prev.seat_id]);
      await pool.query("UPDATE seats SET is_occupied=true WHERE seat_id=$1", [seat_id]);
    }

    return ok(res, "Reserva actualizada", { reservation_id: Number(id), total, base, seatChanged, vip_applied: discount > 0, discount, discount_added: discountAdded, fee_accumulated: newFee, fee_added: seatChanged ? base * 0.10 : 0 });
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
    const has_luggage = typeof req.query.has_luggage !== 'undefined' ? req.query.has_luggage === 'true' : undefined;

    const { rows } = await pool.query("SELECT * FROM reservations WHERE reservation_id=$1 AND user_id=$2", [id, uid]);
    if (!rows.length) throw new HttpError("Reserva no encontrada", 404);
    const prev = rows[0];

    // Precio base por clase actual
    const prevSeat = await pool.query("SELECT seat_class FROM seats WHERE seat_id=$1", [prev.seat_id]);
    const prevClass = prevSeat.rows[0]?.seat_class || '';
    const base = basePriceForClass(prevClass);
    const prevFee = Number(prev.modification_fee || 0);
    let total = base + prevFee;
    const seatChanged = seat_id && Number(seat_id) !== prev.seat_id;
    if (seatChanged) {
      total = base + prevFee + (base * 0.10); // suma el acumulado y el 10% de esta modificación
      // Validar que el asiento potencial esté libre y misma clase
      const seatQ = await pool.query("SELECT is_occupied, seat_class FROM seats WHERE seat_id=$1", [seat_id]);
      if (!seatQ.rows.length) throw new HttpError("Asiento no existe", 404);
      if (seatQ.rows[0].is_occupied) throw new HttpError("Asiento no disponible", 400);
      if (String(seatQ.rows[0].seat_class || '').toLowerCase() !== String(prevClass).toLowerCase()) {
        throw new HttpError("Solo puede cambiar dentro de la misma clase.", 400);
      }
    }

  // VIP: aplicar -10% solo una vez por reserva
  const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
  const vipEligible = (r.rows[0]?.cnt || 0) >= 5;
  const prevDiscount = Number(prev.discount || 0);
  const discountPreview = prevDiscount > 0 ? prevDiscount : (vipEligible ? Math.round(base * 0.10 * 100) / 100 : 0);
  total = Math.max(0, total - discountPreview);

    // Nota: has_luggage no afecta total actualmente; se incluye para futura lógica.
    return ok(res, "Cotización de cambio", { reservation_id: Number(id), total, base, seatChanged: !!seatChanged, vip_applied: prevDiscount > 0, discount: discountPreview, discount_applied: prevDiscount > 0, discount_added: prevDiscount === 0 && vipEligible ? discountPreview : 0, fee_accumulated: prevFee, fee_added: seatChanged ? base * 0.10 : 0, has_luggage: typeof has_luggage === 'boolean' ? has_luggage : undefined });
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

// POST /api/reservations/cancel-by-cui-seat { cui, seat_code }
export const cancelReservationByCUIAndSeat = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { cui, seat_code } = req.body || {};
    const cleanCui = String(cui || '').replace(/[^0-9]/g, '');
    const code = String(seat_code || '').trim();
    if (!cleanCui || !code) throw new HttpError("Debe proporcionar cui y seat_code.", 400);
    if (!validateCUI(cleanCui)) throw new HttpError("CUI inválido.", 400);

    const q = await pool.query(
      `SELECT r.reservation_id, r.seat_id, s.seat_number, p.full_name, p.cui, u.email
         FROM reservations r
         JOIN passengers p ON p.passenger_id = r.passenger_id
         JOIN seats s ON s.seat_id = r.seat_id
         JOIN users u ON u.user_id = r.user_id
        WHERE r.user_id=$1 AND p.cui=$2 AND s.seat_number=$3`,
      [uid, cleanCui, code]
    );
    if (!q.rows.length) throw new HttpError("No se encontró una reserva que coincida con el CUI y asiento.", 404);
    const row = q.rows[0];
    // Eliminar reserva y liberar asiento
    await pool.query("DELETE FROM reservations WHERE reservation_id=$1", [row.reservation_id]);
    await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [row.seat_id]);

    // Enviar correo (best-effort, no bloqueante si falla)
    if (row.email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
            secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false',
            auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
        });
        const info = await transporter.sendMail({
          from: process.env.MAIL_FROM || 'no-reply@14fly.local',
          to: row.email,
          subject: 'Cancelación de reserva',
          text: `Tu reserva del asiento ${row.seat_number} ha sido cancelada correctamente. CUI: ${row.cui}. Gracias por usar 14FLY.`,
          html: `<p>Hola <strong>${row.full_name}</strong>,</p><p>Tu reserva del asiento <strong>${row.seat_number}</strong> ha sido cancelada correctamente.</p><p>CUI: <strong>${row.cui}</strong></p><p>Gracias por usar <strong>14FLY</strong>.</p>`
        });
        // Opcional: log de mensaje
        if (process.env.NODE_ENV !== 'production') {
          console.log('Correo de cancelación enviado:', info.messageId);
        }
      } catch (mailErr) {
        console.warn('Fallo al enviar correo de cancelación:', mailErr.message);
      }
    }

    return ok(res, "Reserva cancelada", { seat_code: code, cui: cleanCui });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

// POST /api/reservations/cancel-batch { batch_id }
export const cancelBatchReservations = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { batch_id } = req.body || {};
    if (!batch_id) throw new HttpError("Debe proporcionar batch_id.", 400);
    // Obtener reservas del batch del usuario
    const q = await pool.query(
      `SELECT r.reservation_id, r.seat_id, s.seat_number, u.email
         FROM reservations r
         JOIN seats s ON s.seat_id=r.seat_id
         JOIN users u ON u.user_id=r.user_id
        WHERE r.user_id=$1 AND r.batch_id=$2`,
      [uid, batch_id]
    );
    if (!q.rows.length) throw new HttpError("No se encontraron reservas para ese batch.", 404);
    const seatIds = q.rows.map(r => r.seat_id);
    const reservationIds = q.rows.map(r => r.reservation_id);
    await pool.query("DELETE FROM reservations WHERE reservation_id = ANY($1::int[])", [reservationIds]);
    await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id = ANY($1::int[])", [seatIds]);

    // Enviar correo si existe email (usar el primero)
    const email = q.rows[0]?.email;
    if (email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
          secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false',
          auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
        });
        const info = await transporter.sendMail({
          from: process.env.MAIL_FROM || 'no-reply@14fly.local',
          to: email,
          subject: 'Cancelación de conjunto de reservas',
          text: `Se han cancelado ${reservationIds.length} reservas del batch ${batch_id}. Gracias por usar 14FLY.`,
          html: `<p>Se han cancelado <strong>${reservationIds.length}</strong> reservas del conjunto <strong>${batch_id}</strong>.</p><p>Gracias por usar <strong>14FLY</strong>.</p>`
        });
        if (process.env.NODE_ENV !== 'production') console.log('Correo batch cancel enviado:', info.messageId);
      } catch (e) {
        console.warn('Fallo al enviar correo batch cancel:', e.message);
      }
    }
    return ok(res, "Conjunto cancelado", { batch_id, count: reservationIds.length });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

// POST /api/reservations/lookup { cui, seat_code }
export const lookupReservationByCUIAndSeat = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { cui, seat_code } = req.body || {};
    const cleanCui = String(cui || '').replace(/[\s\-]/g, '');
    const code = String(seat_code || '').trim();
    if (!cleanCui || !code) throw new HttpError("Debe proporcionar cui y seat_code.", 400);
    if (!validateCUI(cleanCui)) throw new HttpError("CUI inválido.", 400);

    const q = await pool.query(
      `SELECT r.reservation_id, s.seat_id, s.seat_number AS seat_code, s.seat_class,
              p.full_name, p.cui, r.reservation_date AS created_at
         FROM reservations r
         JOIN passengers p ON p.passenger_id = r.passenger_id
         JOIN seats s ON s.seat_id = r.seat_id
        WHERE r.user_id=$1 AND p.cui=$2 AND s.seat_number=$3`,
      [uid, cleanCui, code]
    );
    if (!q.rows.length) throw new HttpError("No se encontró una reserva para ese CUI y asiento.", 404);
    return ok(res, "Reserva encontrada", q.rows[0]);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};
