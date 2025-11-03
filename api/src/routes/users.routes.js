import express from "express";
import { register, login, isVip, me } from "../controllers/users.controller.js";
import { validateCuiMiddleware } from "../middleware/validateCUI.js";
import { auth } from "../middleware/auth.js";
const router = express.Router();

router.post("/register", validateCuiMiddleware, register);
router.post("/login", login);
router.get('/me/vip', auth, isVip);
router.get('/me', auth, me);

export default router;
