import { pool } from "../db/pool.js";
import { ok } from "../utils/response.js";
import express from "express";

// Precios base por clase (configurables vía ENV)
const BUSINESS_PRICE = Number(process.env.BUSINESS_PRICE || 1500);
const ECONOMY_PRICE = Number(process.env.ECONOMY_PRICE || 500);
function basePriceForClass(seatClassName) {
  const sc = String(seatClassName || '').toLowerCase();
  return sc.includes('negocio') ? BUSINESS_PRICE : ECONOMY_PRICE;
}

export const getSummary = async (req, res) => {
  try {
    const [{ rows: rUsers }, { rows: rSeatsOcc }, { rows: rSeatsFree }, { rows: rRes }] = await Promise.all([
      pool.query("SELECT COUNT(DISTINCT user_id)::int AS users_active FROM reservations"),
      pool.query("SELECT COUNT(*)::int AS occupied FROM seats WHERE is_occupied=true"),
      pool.query("SELECT COUNT(*)::int AS free FROM seats WHERE is_occupied=false"),
      pool.query("SELECT COUNT(*)::int AS total FROM reservations"),
    ]);
    return ok(res, "Resumen", {
      users_active: rUsers[0]?.users_active || 0,
      seats: { occupied: rSeatsOcc[0]?.occupied || 0, free: rSeatsFree[0]?.free || 0 },
      reservations_total: rRes[0]?.total || 0,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, data: null });
  }
};

// Utilidad para formatear fecha a dd/MM/yyyy HH:mm (24h)
function formatDateTime(dt) {
  const d = new Date(dt);
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const mon = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hrs = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${day}/${mon}/${year} ${hrs}:${min}`;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// GET /api/reports/reservations.xml
export const exportReservationsXML = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.seat_number, p.full_name AS passenger_name, u.email AS user_email,
              p.cui AS id_number, r.has_luggage, r.reservation_date
         FROM reservations r
         JOIN seats s ON s.seat_id = r.seat_id
         JOIN passengers p ON p.passenger_id = r.passenger_id
         JOIN users u ON u.user_id = r.user_id
        ORDER BY r.reservation_date ASC`
    );

    const items = rows.map(r => `  <flightSeat>
    <seatNumber>${xmlEscape(r.seat_number || '')}</seatNumber>
    <passengerName>${xmlEscape(r.passenger_name || '')}</passengerName>
    <user>${xmlEscape(r.user_email || '')}</user>
    <idNumber>${xmlEscape(r.id_number || '')}</idNumber>
    <hasLuggage>${r.has_luggage ? 'true' : 'false'}</hasLuggage>
    <reservationDate>${xmlEscape(formatDateTime(r.reservation_date))}</reservationDate>
  </flightSeat>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<flightReservation>\n${items}\n</flightReservation>\n`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reservations.xml"');
    return res.status(200).send(xml);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, data: null });
  }
};

// Body parser específico para XML/texto (lo usará la ruta)
export const xmlBodyParser = express.text({ type: [ 'application/xml', 'text/xml', 'application/octet-stream' ] });

// POST /api/reports/reservations.xml/upload (admin)
// Acepta el XML exportado previamente, intenta cargar asiento por asiento y continúa con errores.
export const importReservationsXML = async (req, res) => {
  const started = Date.now();
  const xml = typeof req.body === 'string' ? req.body : '';
  if (!xml || xml.indexOf('<flightReservation') === -1) {
    return res.status(400).json({ success: false, message: 'Archivo XML inválido o vacío.', data: null });
  }
  const client = await pool.connect();
  const successes = [];
  const errors = [];
  try {
    // Extraer bloques <flightSeat>...</flightSeat>
    const seatBlocks = Array.from(xml.matchAll(/<flightSeat>([\s\S]*?)<\/flightSeat>/gi)).map(m => m[1] || '');
    // Helper para obtener valor de una etiqueta simple
    const getTag = (block, tag) => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    // Pre-resolver usuarios y VIP elegibilidad por lote (por email)
    const entries = seatBlocks.map((blk) => {
      const seatNumber = getTag(blk, 'seatNumber');
      const passengerName = getTag(blk, 'passengerName');
      const userEmail = getTag(blk, 'user');
      const idNumber = getTag(blk, 'idNumber');
      const hasLuggage = /^true$/i.test(getTag(blk, 'hasLuggage'));
      const reservationDateStr = getTag(blk, 'reservationDate');
      return { blk, seatNumber, passengerName, userEmail, idNumber, hasLuggage, reservationDateStr };
    });

    const emails = Array.from(new Set(entries.map(e => e.userEmail).filter(Boolean)));
    const userMap = new Map(); // email -> user_id
    if (emails.length) {
      const uqAll = await client.query('SELECT user_id, email FROM users WHERE email = ANY($1::text[])', [emails]);
      for (const r of uqAll.rows) userMap.set(r.email, r.user_id);
    }
    // Construir mapa de reservas actuales por usuario para determinar VIP (antes del lote)
    const userIds = Array.from(new Set(Array.from(userMap.values())));
    const vipMap = new Map(); // email -> boolean
    if (userIds.length) {
      const cnt = await client.query(
        'SELECT user_id, COUNT(*)::int AS cnt FROM reservations WHERE user_id = ANY($1::int[]) GROUP BY user_id',
        [userIds]
      );
      const countMap = new Map(cnt.rows.map(r => [r.user_id, r.cnt]));
      for (const [email, uid] of userMap.entries()) {
        const before = countMap.get(uid) || 0;
        vipMap.set(email, before >= 5);
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const { seatNumber, passengerName, userEmail, idNumber, hasLuggage, reservationDateStr } = entries[i];
      const ctx = { seatNumber, passengerName, userEmail, idNumber };
      // Validaciones básicas
      if (!seatNumber || !passengerName || !userEmail || !idNumber) {
        errors.push({ ...ctx, error: 'Campos obligatorios faltantes (seatNumber, passengerName, user, idNumber).' });
        continue;
      }

      try {
        // Usuario debe existir
        const userId = userMap.get(userEmail);
        if (!userId) {
          errors.push({ ...ctx, error: 'usuario-no-existe' });
          continue;
        }

        // Asiento debe existir y estar libre
        const sq = await client.query('SELECT seat_id, is_occupied, seat_class FROM seats WHERE seat_number=$1', [seatNumber]);
        if (!sq.rows.length) {
          errors.push({ ...ctx, error: 'asiento-no-existe' });
          continue;
        }
        if (sq.rows[0].is_occupied) {
          errors.push({ ...ctx, error: 'asiento-ocupado' });
          continue;
        }
        const seatId = sq.rows[0].seat_id;
        const seatClassName = sq.rows[0].seat_class || '';
        const priceBase = basePriceForClass(seatClassName);
        const vipEligible = !!vipMap.get(userEmail);
        const discount = vipEligible ? Math.round(priceBase * 0.10 * 100) / 100 : 0;
        const total = Math.max(0, priceBase - discount);

        // Pasajero: crear/actualizar por CUI
        const px = await client.query(
          `INSERT INTO passengers(full_name, cui)
           VALUES ($1,$2)
           ON CONFLICT (cui) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, passengers.full_name)
           RETURNING passenger_id, full_name`,
          [passengerName, String(idNumber).replace(/[\s\-]/g,'')]
        );
        const passengerId = px.rows[0].passenger_id;

        // Marcar asiento y crear reserva con precios correctos
        await client.query('BEGIN');
        const up = await client.query('UPDATE seats SET is_occupied=true WHERE seat_id=$1 AND is_occupied=false RETURNING seat_id', [seatId]);
        if (!up.rows.length) {
          await client.query('ROLLBACK');
          errors.push({ ...ctx, error: 'asiento-ocupado' });
          continue;
        }

        // Parse fecha si viene en formato dd/MM/yyyy HH:mm; si no, usar NOW()
        let parsedDate = null;
        const dm = reservationDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
        if (dm) {
          const [_, dd, mm, yyyy, HH, MM] = dm;
          parsedDate = new Date(Number(yyyy), Number(mm)-1, Number(dd), Number(HH), Number(MM));
        }

        await client.query(
          `INSERT INTO reservations(user_id, seat_id, passenger_id, has_luggage, price_base, discount, modification_fee, total_price, reservation_date, batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,COALESCE($8, NOW()), NULL)`,
          [userId, seatId, passengerId, hasLuggage, priceBase, discount, total, parsedDate]
        );
        await client.query('COMMIT');
        successes.push({ ...ctx, price_base: priceBase, discount, total_price: total, vip_applied: discount > 0 });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        errors.push({ ...ctx, error: e.message });
      }
    }

    const elapsedMs = Date.now() - started;
    return res.json({
      success: true,
      message: 'Importación completada',
      data: {
        total: seatBlocks.length,
        ok: successes.length,
        errorsCount: errors.length,
        elapsedMs,
        successes,
        errors
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, data: null });
  } finally {
    client.release();
  }
};

// GET /api/reports/admin-dashboard (admin)
// Devuelve métricas globales y por usuario para el panel de administrador
export const adminDashboard = async (req, res) => {
  try {
    // Métricas globales
    const [usersTotalQ, seatsBizOccQ, seatsEcoOccQ, seatsBizFreeQ, seatsEcoFreeQ, resTotalQ, selManualQ, selRandomQ, modifiedQ, cancelledQ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS users_total FROM users'),
      pool.query("SELECT COUNT(*)::int AS cnt FROM seats WHERE is_occupied=true AND LOWER(seat_class) LIKE '%negoc%'") ,
      pool.query("SELECT COUNT(*)::int AS cnt FROM seats WHERE is_occupied=true AND LOWER(seat_class) LIKE '%econ%'") ,
      pool.query("SELECT COUNT(*)::int AS cnt FROM seats WHERE is_occupied=false AND LOWER(seat_class) LIKE '%negoc%'") ,
      pool.query("SELECT COUNT(*)::int AS cnt FROM seats WHERE is_occupied=false AND LOWER(seat_class) LIKE '%econ%'") ,
      pool.query('SELECT COUNT(*)::int AS reservations_total FROM reservations'),
      pool.query("SELECT COUNT(*)::int AS cnt FROM reservation_activity WHERE type='created' AND selection_mode='manual'"),
      pool.query("SELECT COUNT(*)::int AS cnt FROM reservation_activity WHERE type='created' AND selection_mode='random'"),
      pool.query("SELECT COUNT(*)::int AS cnt FROM reservation_activity WHERE type='modified'"),
      pool.query("SELECT COUNT(*)::int AS cnt FROM reservation_activity WHERE type='cancelled'")
    ]);

    // Métricas por usuario (reservas, modificadas, canceladas, seleccionadas manual/aleatorio)
    const perUser = await pool.query(`
      WITH r AS (
        SELECT user_id, COUNT(*)::int AS reservations_total
        FROM reservations
        GROUP BY user_id
      ),
      a AS (
        SELECT user_id,
               SUM(CASE WHEN type='modified' THEN 1 ELSE 0 END)::int AS modified,
               SUM(CASE WHEN type='cancelled' THEN 1 ELSE 0 END)::int AS cancelled,
               SUM(CASE WHEN type='created' AND selection_mode='manual' THEN 1 ELSE 0 END)::int AS created_manual,
               SUM(CASE WHEN type='created' AND selection_mode='random' THEN 1 ELSE 0 END)::int AS created_random
        FROM reservation_activity
        GROUP BY user_id
      )
      SELECT u.user_id, u.full_name, u.email,
             COALESCE(r.reservations_total, 0) AS reservations_total,
             COALESCE(a.modified, 0) AS modified,
             COALESCE(a.cancelled, 0) AS cancelled,
             COALESCE(a.created_manual, 0) AS created_manual,
             COALESCE(a.created_random, 0) AS created_random
      FROM users u
      LEFT JOIN r ON r.user_id = u.user_id
      LEFT JOIN a ON a.user_id = u.user_id
      ORDER BY reservations_total DESC, u.full_name ASC
    `);

    return ok(res, 'Resumen admin', {
      users_total: usersTotalQ.rows[0]?.users_total || 0,
      reservations_total: resTotalQ.rows[0]?.reservations_total || 0,
      seats: {
        business: { occupied: seatsBizOccQ.rows[0]?.cnt || 0, free: seatsBizFreeQ.rows[0]?.cnt || 0 },
        economy: { occupied: seatsEcoOccQ.rows[0]?.cnt || 0, free: seatsEcoFreeQ.rows[0]?.cnt || 0 }
      },
      selections: {
        manual: selManualQ.rows[0]?.cnt || 0,
        random: selRandomQ.rows[0]?.cnt || 0
      },
      modified: modifiedQ.rows[0]?.cnt || 0,
      cancelled: cancelledQ.rows[0]?.cnt || 0,
      per_user: perUser.rows
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};
