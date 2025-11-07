import { pool } from "../db/pool.js";
import { ok } from "../utils/response.js";

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
