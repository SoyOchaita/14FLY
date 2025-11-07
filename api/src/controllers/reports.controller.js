import { pool } from "../db/pool.js";
import { ok } from "../utils/response.js";
import express from "express";

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

    for (let i = 0; i < seatBlocks.length; i++) {
      const blk = seatBlocks[i];
      const seatNumber = getTag(blk, 'seatNumber');
      const passengerName = getTag(blk, 'passengerName');
      const userEmail = getTag(blk, 'user');
      const idNumber = getTag(blk, 'idNumber');
      const hasLuggage = /^true$/i.test(getTag(blk, 'hasLuggage'));
      const reservationDateStr = getTag(blk, 'reservationDate');

      const ctx = { seatNumber, passengerName, userEmail, idNumber };
      // Validaciones básicas
      if (!seatNumber || !passengerName || !userEmail || !idNumber) {
        errors.push({ ...ctx, error: 'Campos obligatorios faltantes (seatNumber, passengerName, user, idNumber).' });
        continue;
      }

      try {
        // Usuario debe existir
        const uq = await client.query('SELECT user_id FROM users WHERE email=$1', [userEmail]);
        if (!uq.rows.length) {
          errors.push({ ...ctx, error: 'usuario-no-existe' });
          continue;
        }
        const userId = uq.rows[0].user_id;

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

        // Pasajero: crear/actualizar por CUI
        const px = await client.query(
          `INSERT INTO passengers(full_name, cui)
           VALUES ($1,$2)
           ON CONFLICT (cui) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, passengers.full_name)
           RETURNING passenger_id, full_name`,
          [passengerName, String(idNumber).replace(/\s|-/g,'')]
        );
        const passengerId = px.rows[0].passenger_id;

        // Marcar asiento y crear reserva (sin precios; objetivo: asignación)
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
           VALUES ($1,$2,$3,$4,0,0,0,0,COALESCE($5, NOW()), NULL)`,
          [userId, seatId, passengerId, hasLuggage, parsedDate]
        );
        await client.query('COMMIT');
        successes.push(ctx);
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        errors.push({ ...ctx, error: e.message });
      }
    }

    const elapsedMs = Date.now() - started;
    return res.json({ success: true, message: 'Importación completada', data: { total: seatBlocks.length, ok: successes.length, errors: errors.length, elapsedMs, successes, errors } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, data: null });
  } finally {
    client.release();
  }
};
