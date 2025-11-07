import express from "express";
import { getSummary, exportReservationsXML } from "../controllers/reports.controller.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// Se puede proteger si es necesario: router.get('/', auth, getSummary)
router.get('/', getSummary);
router.get('/reservations.xml', exportReservationsXML);

export default router;
