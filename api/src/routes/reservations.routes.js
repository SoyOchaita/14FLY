import express from "express";
import { auth } from "../middleware/auth.js";
import { createReservation, getMyReservations, updateReservation, cancelReservation } from "../controllers/reservations.controller.js";

const router = express.Router();

router.post("/", auth, createReservation);
router.get("/me", auth, getMyReservations);
router.put("/:id", auth, updateReservation);
router.delete("/:id", auth, cancelReservation);

export default router;
