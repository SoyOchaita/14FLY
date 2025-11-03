import express from "express";
import { getSeats, reserveSeat, releaseSeat, getSeatMap, resetSeats, getRandomSeatByClass } from "../controllers/seats.controller.js";
const router = express.Router();

router.get("/", getSeats);
router.get("/map", getSeatMap);
router.get("/random/:class", getRandomSeatByClass);
router.post("/reset", resetSeats);
router.patch("/:id/reserve", reserveSeat);
router.patch("/:id/release", releaseSeat);

export default router;
