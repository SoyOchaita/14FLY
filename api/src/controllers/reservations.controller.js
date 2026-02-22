import { pool } from "../db/pool.js";
import { randomUUID } from "crypto";
import { ok, HttpError } from "../utils/response.js";
import { validateCUI, validateFullName } from "../utils/validators.js";
import { sendMail, renderTemplate } from "../utils/mailer.js";
import { AuditLog } from "../utils/auditLog.js";

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
  const beforeCount = vipCheck.rows[0]?.cnt || 0;
  const vipEligible = beforeCount >= 5;
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

    // Log de actividad de creación (manual o aleatoria)
    try {
      const mode = selectionMode === 'random' ? 'random' : 'manual';
      for (const r of created) {
        await pool.query(
          `INSERT INTO reservation_activity(user_id, reservation_id, type, selection_mode) VALUES ($1,$2,'created',$3)`,
          [uid, r.reservation_id, mode]
        );
      }
    } catch (logErr) {
      console.warn('No se pudo registrar actividad de creación:', logErr.message);
    }
    // Enviar correo de confirmación de creación (best-effort). Para evitar inconsistencias,
    // se calcula el resumen usando TODAS las reservas del mismo batch en la BD.
    try {
      const u = await pool.query("SELECT full_name, email FROM users WHERE user_id=$1", [uid]);
      const email = u.rows[0]?.email;
      const name = u.rows[0]?.full_name || '';
      if (email) {
        const rs = await pool.query(
          `SELECT s.seat_number, s.seat_class, r.price_base, r.discount, r.modification_fee, r.total_price
             FROM reservations r
             JOIN seats s ON s.seat_id = r.seat_id
            WHERE r.user_id=$1 AND r.batch_id=$2
            ORDER BY r.reservation_date ASC`,
          [uid, batchId]
        );

        if (rs.rows.length) {
          const nf = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
          // Agrupar por clase para un resumen similar a "Mis Reservas"
          const groups = rs.rows.reduce((acc, r) => {
            const cls = String(r.seat_class || 'Clase').trim();
            if (!acc[cls]) acc[cls] = { count: 0, base: Number(r.price_base || 0), subtotal: 0 };
            acc[cls].count += 1;
            // Guardar precio base de referencia por clase (si cambió, mantener el primero)
            if (!acc[cls].base) acc[cls].base = Number(r.price_base || 0);
            acc[cls].subtotal += Number(r.total_price || 0);
            return acc;
          }, {});

          const totalGroup = Object.values(groups).reduce((acc, g) => acc + Number(g.subtotal || 0), 0);
          const totalSeats = rs.rows.length;
          const anyVip = rs.rows.some(r => Number(r.discount||0) > 0);

          const rowsHtml = Object.entries(groups).map(([cls, g]) => `
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08)">${cls}</td>
                <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center">${g.count}</td>
                <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">${nf.format(g.base)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right"><strong>${nf.format(g.subtotal)}</strong></td>
              </tr>
            `).join('');

          // Agregar lista de asientos y CTA opcional
          const seatsList = rs.rows.map(r => r.seat_number).join(', ');
          const appUrl = process.env.WEB_URL || process.env.APP_URL || process.env.FRONTEND_URL || '';
          const cta = appUrl
            ? `<p style="margin:16px 0 0"><a href="${appUrl}" style="display:inline-block;background:#f9b17a;color:#2d3250;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Ver mis reservas</a></p>`
            : '';

          // Estado VIP (antes/después) para explicar qué sucede
          const afterCntRes = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [uid]);
          const afterCount = afterCntRes.rows[0]?.cnt || 0;
          const becameVip = beforeCount < 5 && afterCount >= 5;
          const pendingForVip = Math.max(0, 5 - afterCount);

          const vipNote = anyVip
            ? '<p style="color:#16a34a;margin-top:6px">Descuento VIP (10%) aplicado en esta compra.</p>'
            : (becameVip
              ? '<p style="color:#93c5fd;margin-top:6px">¡Acabas de alcanzar estatus VIP! El 10% se aplicará en tus próximas reservas.</p>'
              : `<p style="color:#93c5fd;margin-top:6px">Aún no eres VIP. Te faltan <strong>${pendingForVip}</strong> reserva(s) para obtener 10% de descuento.</p>`);

          const contentHtml = `
            <h2 style="margin:0 0 8px;color:#fff">Reserva confirmada</h2>
            <p style="margin:0 0 8px">Hola <strong>${name || email}</strong>, gracias por reservar con 14FLY.</p>
            <p style="margin:0 0 8px"><strong>Asientos:</strong> ${seatsList}</p>
            <h3 style="margin:12px 0 6px;color:#fff;font-size:16px">Resumen</h3>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;min-width:360px">
              <thead style="background:rgba(255,255,255,.04)">
                <tr>
                  <th style="text-align:left;padding:8px 12px">Clase</th>
                  <th style="text-align:center;padding:8px 12px">Asientos</th>
                  <th style="text-align:right;padding:8px 12px">Precio</th>
                  <th style="text-align:right;padding:8px 12px">Subtotal</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr>
                  <td colspan="3" style="padding:8px 12px;text-align:right;color:#93c5fd">Total (${totalSeats} asiento(s))</td>
                  <td style="padding:8px 12px;text-align:right;font-weight:600">${nf.format(totalGroup)}</td>
                </tr>
              </tfoot>
            </table>
            ${vipNote}
            ${cta}
            <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no realizaste esta compra, contáctanos de inmediato.</p>
          `;
          const html = renderTemplate({ title: 'Reserva confirmada', intro: 'Detalles de tu compra.', contentHtml });
          sendMail({ to: email, subject: '14FLY • Reserva confirmada', html, text: `Reserva confirmada: ${totalSeats} asiento(s). Total: Q${totalGroup.toFixed(2)}. Asientos: ${seatsList}` })
            .catch(e => console.warn('Fallo al enviar correo de creación:', e.message));

          // Si el usuario acaba de alcanzar VIP, enviar correo de estatus VIP
          if (becameVip) {
            try {
              const appUrl = process.env.WEB_URL || process.env.APP_URL || process.env.FRONTEND_URL || '';
              const cta = appUrl
                ? `<p style="margin:16px 0 0"><a href="${appUrl}" style="display:inline-block;background:#f9b17a;color:#2d3250;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Reservar ahora</a></p>`
                : '';
              const contentHtml = `
                <h2 style="margin:0 0 8px;color:#fff">¡Felicidades, ${name || email}!</h2>
                <p style="margin:0 0 8px">Has alcanzado el nivel <strong>VIP</strong> en 14FLY.</p>
                <ul style="margin:8px 0 0;padding-left:18px;color:#c7d2fe">
                  <li>10% de descuento en tus reservas.</li>
                  <li>Atención prioritaria.</li>
                  <li>Promociones exclusivas.</li>
                </ul>
                ${cta}
              `;
              const vipHtml = renderTemplate({ title: 'Estatus VIP', intro: 'Beneficios VIP activados en tu cuenta', contentHtml });
              await sendMail({ to: email, subject: '14FLY • ¡Eres VIP!', html: vipHtml, text: 'Has alcanzado el nivel VIP en 14FLY. Disfruta 10% de descuento en tus reservas.' });
            } catch (vipErr) {
              console.warn('Fallo al enviar correo de estatus VIP:', vipErr.message);
            }
          }
        }
      }
    } catch (mailErr) {
      console.warn('Fallo al preparar correo de creación:', mailErr.message);
    }
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
        WHERE r.user_id = $1 AND r.deleted_at IS NULL
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
    // Datos de pasajero ANTES del cambio
    const prevPaxQ = await pool.query("SELECT full_name, cui FROM passengers WHERE passenger_id=$1", [prev.passenger_id]);
    const prevPaxName = prevPaxQ.rows[0]?.full_name || '';
    const prevPaxCui = prevPaxQ.rows[0]?.cui || '';
    // Obtener clase base de la reserva actual
  const prevSeat = await pool.query("SELECT seat_class, seat_number FROM seats WHERE seat_id=$1", [prev.seat_id]);
  const prevClass = prevSeat.rows[0]?.seat_class || '';
  const prevSeatNumber = prevSeat.rows[0]?.seat_number || '';
  let base = basePriceForClass(prevClass);
  const prevFee = Number(prev.modification_fee || 0);
  let total = base + prevFee;
    const seatChanged = seat_id && Number(seat_id) !== prev.seat_id;
    if (seatChanged) {
      // Validar nuevo asiento disponible y clase
      const seatQ = await pool.query("SELECT is_occupied, seat_class, seat_number FROM seats WHERE seat_id=$1", [seat_id]);
      if (!seatQ.rows.length) throw new HttpError("Asiento no existe", 404);
      if (seatQ.rows[0].is_occupied) throw new HttpError("Asiento no disponible", 400);
      const newClass = seatQ.rows[0].seat_class || '';
      var newSeatNumber = seatQ.rows[0]?.seat_number || '';
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

    // Enviar correo de modificación (best-effort)
    try {
      const u = await pool.query("SELECT full_name, email FROM users WHERE user_id=$1", [uid]);
      const email = u.rows[0]?.email;
      const name = u.rows[0]?.full_name || '';
      if (email) {
        const currency = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(n || 0));
        const afterSeatText = seatChanged ? (typeof newSeatNumber !== 'undefined' ? newSeatNumber : '(actualizado)') : prevSeatNumber;
        const luggageChanged = typeof has_luggage === 'boolean' ? (has_luggage !== !!prev.has_luggage) : false;
        const feeAdded = Math.max(0, Number(newFee) - Number(prevFee));

        // Datos de pasajero DESPUÉS del cambio
        const afterPaxQ = await pool.query(
          "SELECT full_name, cui FROM passengers WHERE passenger_id=$1",
          [newPassengerId || prev.passenger_id]
        );
        const afterPaxName = afterPaxQ.rows[0]?.full_name || prevPaxName;
        const afterPaxCui = afterPaxQ.rows[0]?.cui || prevPaxCui;
        const paxNameChanged = (full_name ? validateFullName(full_name) : null) ? validateFullName(full_name) !== prevPaxName : (newPassengerId ? afterPaxName !== prevPaxName : false);
        const paxCuiClean = cui ? String(cui).replace(/[\s\-]/g, "") : null;
        const paxCuiChanged = paxCuiClean ? paxCuiClean !== prevPaxCui : (newPassengerId ? afterPaxCui !== prevPaxCui : false);

        const changesTableRows = [
          `<tr><td style="padding:8px 12px">Asiento</td><td style="padding:8px 12px;color:#93c5fd">${prevSeatNumber || '—'}</td><td style="padding:8px 12px;text-align:right">${afterSeatText || '—'}</td></tr>`,
          ...(luggageChanged ? [`<tr><td style=\"padding:8px 12px\">Equipaje</td><td style=\"padding:8px 12px;color:#93c5fd\">${prev.has_luggage ? 'Sí' : 'No'}</td><td style=\"padding:8px 12px;text-align:right\">${has_luggage ? 'Sí' : 'No'}</td></tr>`] : []),
          ...(paxNameChanged ? [`<tr><td style=\"padding:8px 12px\">Pasajero</td><td style=\"padding:8px 12px;color:#93c5fd\">${prevPaxName || '—'}</td><td style=\"padding:8px 12px;text-align:right\">${afterPaxName || '—'}</td></tr>`] : []),
          ...(paxCuiChanged ? [`<tr><td style=\"padding:8px 12px\">CUI</td><td style=\"padding:8px 12px;color:#93c5fd\">${prevPaxCui || '—'}</td><td style=\"padding:8px 12px;text-align:right\">${afterPaxCui || '—'}</td></tr>`] : []),
        ].join('');

        const changesTable = changesTableRows
          ? `
            <h3 style="margin:12px 0 6px;color:#fff;font-size:16px">Cambios realizados</h3>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
              <thead style="background:rgba(255,255,255,.04)">
                <tr>
                  <th style="text-align:left;padding:8px 12px">Campo</th>
                  <th style="text-align:left;padding:8px 12px">Antes</th>
                  <th style="text-align:right;padding:8px 12px">Después</th>
                </tr>
              </thead>
              <tbody>
                ${changesTableRows}
              </tbody>
            </table>
          `
          : '';

        const breakdownTable = `
          <h3 style="margin:12px 0 6px;color:#fff;font-size:16px">Desglose de costos</h3>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
            <thead style="background:rgba(255,255,255,.04)">
              <tr>
                <th style="text-align:left;padding:8px 12px">Concepto</th>
                <th style="text-align:right;padding:8px 12px">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="padding:8px 12px;color:#93c5fd">Base</td><td style="padding:8px 12px;text-align:right">${currency(base)}</td></tr>
              ${seatChanged ? `<tr><td style=\"padding:8px 12px;color:#93c5fd\">Recargo por cambio (10%)</td><td style=\"padding:8px 12px;text-align:right\">+ ${currency(feeAdded)}</td></tr>` : ''}
              ${Number(newFee) > 0 ? `<tr><td style=\"padding:8px 12px;color:#93c5fd\">Recargo acumulado</td><td style=\"padding:8px 12px;text-align:right\">${currency(newFee)}</td></tr>` : ''}
              ${discount > 0 ? `<tr><td style=\"padding:8px 12px;color:#93c5fd\">Descuento VIP (10%)</td><td style=\"padding:8px 12px;text-align:right\">- ${currency(discount)}</td></tr>` : ''}
              <tr><td style="padding:8px 12px;color:#93c5fd;font-weight:600">Total</td><td style="padding:8px 12px;text-align:right;font-weight:600">${currency(total)}</td></tr>
            </tbody>
          </table>
        `;

        const vipNote = discountAdded > 0
          ? '<p style="margin:8px 0 0;color:#16a34a">Se aplicó tu descuento VIP por primera vez.</p>'
          : (discount > 0 ? '<p style="margin:8px 0 0;color:#16a34a">Descuento VIP del 10% aplicado.</p>' : '');

        const contentHtml = `
          <h2 style="margin:0 0 8px;color:#fff">Tu reserva fue modificada</h2>
          <p style="margin:0 0 8px">Hola <strong>${name || email}</strong>, estos son los cambios aplicados a tu reserva:</p>
          ${changesTable}
          ${breakdownTable}
          ${vipNote}
          <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste esta modificación, contáctanos de inmediato.</p>
        `;

        const html = renderTemplate({ title: 'Reserva modificada', intro: 'Hemos actualizado tu reserva.', contentHtml });
        sendMail({ to: email, subject: '14FLY • Reserva modificada', html, text: `Tu reserva fue modificada. Total: ${currency(total)}.` })
          .catch(e => console.warn('Fallo al enviar correo de modificación:', e.message));
      }
    } catch (mailErr) {
      console.warn('Fallo al preparar correo de modificación:', mailErr.message);
    }

    // Log de actividad de modificación
    try {
      await pool.query(
        `INSERT INTO reservation_activity(user_id, reservation_id, type) VALUES ($1,$2,'modified')`,
        [uid, Number(id)]
      );
    } catch (logErr) {
      console.warn('No se pudo registrar actividad de modificación:', logErr.message);
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
    const { reason = null } = req.body || {};
    
    console.log(`[CANCEL] User ${uid} cancelling reservation ${id}`);
    
    // Obtener detalles antes de marcar como eliminado
    const { rows } = await pool.query(
      `SELECT r.reservation_id, r.seat_id, s.seat_number, p.full_name, p.cui, u.email, r.status, r.price_base, r.total_price
         FROM reservations r
         JOIN seats s ON s.seat_id = r.seat_id
         JOIN passengers p ON p.passenger_id = r.passenger_id
         JOIN users u ON u.user_id = r.user_id
        WHERE r.reservation_id=$1 AND r.user_id=$2 AND r.deleted_at IS NULL`,
      [id, uid]
    );
    if (!rows.length) {
      console.log(`[CANCEL] Reservation ${id} not found or already cancelled`);
      throw new HttpError("Reserva no encontrada o ya cancelada", 404);
    }
    
    const seatId = rows[0].seat_id;
    const seatNumber = rows[0].seat_number;
    const paxName = rows[0].full_name;
    const paxCui = rows[0].cui;
    const userEmail = rows[0].email;
    const reservation = rows[0];
    
    // SOFT DELETE: marcar como eliminado en lugar de DELETE
    const updateResult = await pool.query("UPDATE reservations SET deleted_at = NOW() WHERE reservation_id=$1", [id]);
    console.log(`[CANCEL] Soft delete applied, rows affected: ${updateResult.rowCount}`);
    
    // Liberar el asiento
    const seatResult = await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [seatId]);
    console.log(`[CANCEL] Seat ${seatNumber} freed, rows affected: ${seatResult.rowCount}`);

    // Registrar en auditoría con detalles
    try {
      const auditResult = await AuditLog.log(uid, Number(id), "cancelled", {
        reason: reason || "Cancelación de usuario",
        details: {
          seat_id: seatId,
          seat_number: seatNumber,
          passenger_name: paxName,
          passenger_cui: paxCui,
          status_before: reservation.status,
          price_base: reservation.price_base,
          total_price: reservation.total_price,
          cancelled_by: uid,
        },
        ipAddress: req.ip || req.connection.remoteAddress || null,
        userAgent: req.get("user-agent") || null,
      });
      console.log(`[CANCEL] Audit logged with ID: ${auditResult?.audit_id}`);
    } catch (logErr) {
      console.error('[CANCEL] Failed to log audit:', logErr.message, logErr.stack);
      // No lanzar error, solo advertir
    }

    // Enviar correo (best-effort)
    if (userEmail) {
      try {
        const appUrl = process.env.WEB_URL || process.env.APP_URL || process.env.FRONTEND_URL || '';
        const cta = appUrl
          ? `<p style="margin:16px 0 0"><a href="${appUrl}" style="display:inline-block;background:#f9b17a;color:#2d3250;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Ver mis reservas</a></p>`
          : '';
        const contentHtml = `
          <h2 style="margin:0 0 8px;color:#fff">Reserva cancelada</h2>
          <p style="margin:0 0 8px">Se ha cancelado tu reserva del asiento <strong>${seatNumber}</strong>.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;min-width:320px">
            <thead style="background:rgba(255,255,255,.04)">
              <tr>
                <th style="text-align:left;padding:8px 12px">Campo</th>
                <th style="text-align:right;padding:8px 12px">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="padding:8px 12px;color:#93c5fd">Asiento</td><td style="padding:8px 12px;text-align:right">${seatNumber}</td></tr>
              <tr><td style="padding:8px 12px;color:#93c5fd">Pasajero</td><td style="padding:8px 12px;text-align:right">${paxName || '—'}</td></tr>
              <tr><td style="padding:8px 12px;color:#93c5fd">CUI</td><td style="padding:8px 12px;text-align:right">${paxCui || '—'}</td></tr>
              ${reason ? `<tr><td style="padding:8px 12px;color:#93c5fd">Motivo</td><td style="padding:8px 12px;text-align:right">${reason}</td></tr>` : ''}
            </tbody>
          </table>
          ${cta}
          <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste esta cancelación, contáctanos de inmediato.</p>
        `;
        const html = renderTemplate({ title: 'Reserva cancelada', intro: 'Tu reserva ha sido cancelada.', contentHtml });
        await sendMail({ to: userEmail, subject: '14FLY • Reserva cancelada', html, text: `Se canceló tu reserva del asiento ${seatNumber}. Pasajero: ${paxName}. CUI: ${paxCui}.` });
      } catch (mailErr) {
        console.warn('Fallo al enviar correo de cancelación:', mailErr.message);
      }
    }

    console.log(`[CANCEL] Reservation ${id} successfully cancelled`);
    return ok(res, "Reserva cancelada", { reservation_id: Number(id), seat_code: seatNumber, cancelled_at: new Date().toISOString() });
  } catch (err) {
    console.error('[CANCEL] Error:', err.message, err.stack);
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

// POST /api/reservations/cancel-by-cui-seat { cui, seat_code, reason }
export const cancelReservationByCUIAndSeat = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { cui, seat_code, reason = null } = req.body || {};
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
        WHERE r.user_id=$1 AND p.cui=$2 AND s.seat_number=$3 AND r.deleted_at IS NULL`,
      [uid, cleanCui, code]
    );
    if (!q.rows.length) throw new HttpError("No se encontró una reserva que coincida con el CUI y asiento.", 404);
    const row = q.rows[0];
    
    // SOFT DELETE
    await pool.query("UPDATE reservations SET deleted_at = NOW() WHERE reservation_id=$1", [row.reservation_id]);
    await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [row.seat_id]);

    // Registrar en auditoría
    try {
      await AuditLog.log(uid, row.reservation_id, "cancelled", {
        reason: reason || "Cancelación por CUI y asiento",
        details: {
          lookup_method: "cui_and_seat",
          seat_number: row.seat_number,
          passenger_cui: cleanCui,
        },
        ipAddress: req.ip || req.connection.remoteAddress || null,
        userAgent: req.get("user-agent") || null,
      });
    } catch (logErr) {
      console.warn('No se pudo registrar auditoría de cancelación (CUI+seat):', logErr.message);
    }

    // Enviar correo (best-effort, no bloqueante si falla)
    if (row.email) {
      try {
        const appUrl = process.env.WEB_URL || process.env.APP_URL || process.env.FRONTEND_URL || '';
        const cta = appUrl
          ? `<p style="margin:16px 0 0"><a href="${appUrl}" style="display:inline-block;background:#f9b17a;color:#2d3250;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Ver mis reservas</a></p>`
          : '';
        const contentHtml = `
          <h2 style="margin:0 0 8px;color:#fff">Reserva cancelada</h2>
          <p style="margin:0 0 8px">Hola <strong>${row.full_name}</strong>, tu reserva ha sido cancelada.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;min-width:320px">
            <thead style="background:rgba(255,255,255,.04)">
              <tr>
                <th style="text-align:left;padding:8px 12px">Campo</th>
                <th style="text-align:right;padding:8px 12px">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="padding:8px 12px;color:#93c5fd">Asiento</td><td style="padding:8px 12px;text-align:right">${row.seat_number}</td></tr>
              <tr><td style="padding:8px 12px;color:#93c5fd">Pasajero</td><td style="padding:8px 12px;text-align:right">${row.full_name}</td></tr>
              <tr><td style="padding:8px 12px;color:#93c5fd">CUI</td><td style="padding:8px 12px;text-align:right">${row.cui}</td></tr>
              ${reason ? `<tr><td style="padding:8px 12px;color:#93c5fd">Motivo</td><td style="padding:8px 12px;text-align:right">${reason}</td></tr>` : ''}
            </tbody>
          </table>
          ${cta}
          <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste esta cancelación, contáctanos de inmediato.</p>
        `;
        const html = renderTemplate({
          title: 'Reserva cancelada',
          intro: 'Tu reserva ha sido cancelada.',
          contentHtml
        });
        await sendMail({
          to: row.email,
          subject: '14FLY • Reserva cancelada',
          html,
          text: `Se canceló tu reserva del asiento ${row.seat_number}. Pasajero: ${row.full_name}. CUI: ${row.cui}.`
        });
      } catch (mailErr) {
        console.warn('Fallo al enviar correo de cancelación:', mailErr.message);
      }
    }

    return ok(res, "Reserva cancelada", { seat_code: code, cui: cleanCui, cancelled_at: new Date().toISOString() });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

// POST /api/reservations/cancel-batch { batch_id, reason }
export const cancelBatchReservations = async (req, res) => {
  try {
    if (!req.user || !req.user.id) throw new HttpError("No autenticado", 401);
    const uid = req.user.id;
    const { batch_id, reason = null } = req.body || {};
    if (!batch_id) throw new HttpError("Debe proporcionar batch_id.", 400);
    
    console.log(`[CANCEL-BATCH] User ${uid} cancelling batch ${batch_id}`);
    
    // Obtener reservas del batch del usuario que no están eliminadas
    const q = await pool.query(
      `SELECT r.reservation_id, r.seat_id, s.seat_number, u.email
         FROM reservations r
         JOIN seats s ON s.seat_id=r.seat_id
         JOIN users u ON u.user_id=r.user_id
        WHERE r.user_id=$1 AND r.batch_id=$2 AND r.deleted_at IS NULL`,
      [uid, batch_id]
    );
    
    // IDEMPOTENCIA: Si no hay reservas activas, el batch ya fue cancelado
    if (!q.rows.length) {
      console.log(`[CANCEL-BATCH] Batch ${batch_id} already cancelled (0 active reservations)`);
      return ok(res, "Este conjunto ya fue cancelado previamente.", { 
        batch_id, 
        count: 0, 
        already_cancelled: true, 
        cancelled_at: new Date().toISOString() 
      });
    }
    
    const seatIds = q.rows.map(r => r.seat_id);
    const reservationIds = q.rows.map(r => r.reservation_id);
    
    console.log(`[CANCEL-BATCH] Found ${reservationIds.length} active reservations to cancel`);
    
    // SOFT DELETE: marcar como eliminado en lugar de DELETE con RETURNING para confirmar
    const updateResult = await pool.query(
      "UPDATE reservations SET deleted_at = NOW() WHERE reservation_id = ANY($1::int[]) RETURNING reservation_id", 
      [reservationIds]
    );
    const cancelledCount = updateResult.rowCount || 0;
    console.log(`[CANCEL-BATCH] Soft deleted ${cancelledCount} reservations`);
    
    const seatResult = await pool.query(
      "UPDATE seats SET is_occupied=false WHERE seat_id = ANY($1::int[]) RETURNING seat_id", 
      [seatIds]
    );
    console.log(`[CANCEL-BATCH] Freed ${seatResult.rowCount} seats`);

    // Registrar cada cancelación en auditoría
    try {
      for (const rid of reservationIds) {
        await AuditLog.log(uid, rid, "cancelled", {
          reason: reason || "Cancelación en lote",
          details: {
            batch_id,
            batch_cancellation: true,
            batch_size: reservationIds.length,
          },
          ipAddress: req.ip || req.connection.remoteAddress || null,
          userAgent: req.get("user-agent") || null,
        });
      }
      console.log(`[CANCEL-BATCH] Audit logged for ${reservationIds.length} reservations`);
    } catch (logErr) {
      console.error('[CANCEL-BATCH] Failed to log audit:', logErr.message, logErr.stack);
    }

    // Enviar correo si existe email (usar el primero)
    const email = q.rows[0]?.email;
    if (email) {
      try {
        const appUrl = process.env.WEB_URL || process.env.APP_URL || process.env.FRONTEND_URL || '';
        const cta = appUrl
          ? `<p style="margin:16px 0 0"><a href="${appUrl}" style="display:inline-block;background:#f9b17a;color:#2d3250;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Ver mis reservas</a></p>`
          : '';
        const seatsList = q.rows.map(r => r.seat_number).join(', ');
        const contentHtml = `
          <h2 style="margin:0 0 8px;color:#fff">Reservas canceladas</h2>
          <p style="margin:0 0 8px">Se han cancelado <strong>${reservationIds.length}</strong> reserva(s).</p>
          <p style="margin:0 0 8px"><strong>Asientos:</strong> ${seatsList}</p>
          ${reason ? `<p style="margin:0 0 8px"><strong>Motivo:</strong> ${reason}</p>` : ''}
          ${cta}
          <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste estas cancelaciones, contáctanos de inmediato.</p>
        `;
        const html = renderTemplate({
          title: 'Reservas canceladas',
          intro: 'Se ha cancelado un conjunto de reservas.',
          contentHtml
        });
        await sendMail({
          to: email,
          subject: '14FLY • Reservas canceladas',
          html,
          text: `Se han cancelado ${reservationIds.length} reservas. Asientos: ${seatsList}`
        });
      } catch (e) {
        console.warn('[CANCEL-BATCH] Failed to send email:', e.message);
      }
    }
    
    console.log(`[CANCEL-BATCH] Successfully cancelled batch ${batch_id} (${cancelledCount} reservations)`);
    return ok(res, "Conjunto cancelado exitosamente", { 
      batch_id, 
      count: cancelledCount, 
      already_cancelled: false,
      cancelled_at: new Date().toISOString() 
    });
  } catch (err) {
    console.error('[CANCEL-BATCH] Error:', err.message, err.stack);
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
