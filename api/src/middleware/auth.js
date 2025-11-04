import jwt from "jsonwebtoken";
import { HttpError } from "../utils/response.js";

export const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError("No autenticado", 401));

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // Normalizar errores de JWT a 401 sin stack ruidoso
      const name = err?.name || "JsonWebTokenError";
      const msg = name === "TokenExpiredError" ? "Sesión expirada" : "No autenticado";
      return next(new HttpError(msg, 401));
    }
    req.user = user;
    next();
  });
};
