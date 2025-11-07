import express from "express";
import { getSummary, exportReservationsXML, importReservationsXML, adminDashboard, backfillActivity } from "../controllers/reports.controller.js";
import { auth } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";

const router = express.Router();

// Se puede proteger si es necesario: router.get('/', auth, getSummary)
router.get('/', getSummary);
router.get('/reservations.xml', auth, isAdmin, exportReservationsXML);
router.post('/reservations.xml/upload', auth, isAdmin, importReservationsXML);
router.get('/admin-dashboard', auth, isAdmin, adminDashboard);
router.post('/activity/backfill', auth, isAdmin, backfillActivity);

export default router;
