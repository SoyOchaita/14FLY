import { pool } from "../db/pool.js";
import { ok, HttpError } from "../utils/response.js";
import { generatePlaneSeats, overlayAvailabilityFromDb, seedSeatsIfNeeded } from "../services/plane.service.js";

export const getSeats = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM seats ORDER BY seat_number");
    return ok(res, "Asientos", result.rows);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const reserveSeat = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT is_occupied FROM seats WHERE seat_id=$1", [id]);
    if (!rows.length) throw new HttpError("Asiento no existe", 404);
    if (rows[0].is_occupied) throw new HttpError("Asiento ya ocupado", 400);
    await pool.query("UPDATE seats SET is_occupied=true WHERE seat_id=$1", [id]);
    return ok(res, "Asiento reservado", { seat_id: Number(id), is_occupied: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const releaseSeat = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT is_occupied FROM seats WHERE seat_id=$1", [id]);
    if (!rows.length) throw new HttpError("Asiento no existe", 404);
    if (!rows[0].is_occupied) throw new HttpError("Asiento ya está libre", 400);
    await pool.query("UPDATE seats SET is_occupied=false WHERE seat_id=$1", [id]);
    return ok(res, "Asiento liberado", { seat_id: Number(id), is_occupied: false });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const getSeatMap = async (req, res) => {
  try {
    // Ensure seats exist in DB; if empty, seed all
    await seedSeatsIfNeeded(pool);

    // Build in-memory plane
    const plane = generatePlaneSeats();

    // Overlay availability from DB
    const { rows } = await pool.query("SELECT seat_number, is_occupied FROM seats");
    const withAvailability = overlayAvailabilityFromDb(plane, rows);

    // Adapt response shape to required spec: { business: [...], economy: [...] }
    const data = {
      business: withAvailability.plane.business.seats.map((s) => ({ code: s.code, available: s.available })),
      economy: withAvailability.plane.economy.seats.map((s) => ({ code: s.code, available: s.available })),
    };
    return ok(res, "Mapa de asientos generado", data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const resetSeats = async (_req, res) => {
  try {
    await pool.query("UPDATE seats SET is_occupied=false");
    const plane = generatePlaneSeats();
    const { rows } = await pool.query("SELECT seat_number, is_occupied FROM seats");
    const withAvailability = overlayAvailabilityFromDb(plane, rows);
    const data = {
      business: withAvailability.plane.business.seats.map((s) => ({ code: s.code, available: s.available })),
      economy: withAvailability.plane.economy.seats.map((s) => ({ code: s.code, available: s.available })),
    };
    return ok(res, "Todos los asientos fueron restablecidos a disponibles", data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const getRandomSeatByClass = async (req, res) => {
  try {
    const seatClassParam = (req.params.class || "").toLowerCase();
    if (!seatClassParam || !["business", "economy"].includes(seatClassParam)) {
      throw new HttpError("Clase inválida. Use 'business' o 'economy'.", 400);
    }
    // Map to DB enum values
    const dbClass = seatClassParam === "business" ? "Negocios" : "Económica";
    const { rows } = await pool.query(
      `SELECT seat_number AS code FROM seats WHERE seat_class=$1 AND is_occupied=false ORDER BY RANDOM() LIMIT 1`,
      [dbClass]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "No hay asientos disponibles.", data: null });
    return ok(res, "Asiento aleatorio", rows[0]);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};
