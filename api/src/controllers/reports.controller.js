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
