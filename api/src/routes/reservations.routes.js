import express from "express";
import { auth } from "../middleware/auth.js";
import { createReservation, getMyReservations, updateReservation, cancelReservation, quoteReservation, lookupReservationByCUIAndSeat, cancelReservationByCUIAndSeat, cancelBatchReservations } from "../controllers/reservations.controller.js";

const router = express.Router();

router.post("/", auth, createReservation);
router.get("/me", auth, getMyReservations);
router.post("/lookup", auth, lookupReservationByCUIAndSeat);
router.post("/cancel-by-cui-seat", auth, cancelReservationByCUIAndSeat);
router.post("/cancel-batch", auth, cancelBatchReservations);
router.get("/:id/quote", auth, quoteReservation);
router.put("/:id", auth, updateReservation);
router.delete("/:id", auth, cancelReservation);

export default router;
