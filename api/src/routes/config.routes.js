import express from "express";
import { ok } from "../utils/response.js";

const router = express.Router();

router.get("/", (req, res) => {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const now = new Date().toISOString();
  const offsetMinutes = new Date().getTimezoneOffset();
  return ok(res, "Config", { timezone: tz, now, offsetMinutes });
});

export default router;
