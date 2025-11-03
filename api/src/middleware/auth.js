import jwt from "jsonwebtoken";
import { HttpError } from "../utils/response.js";

export const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError("Token requerido", 401));

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new HttpError("Token inválido", 403));
    req.user = user;
    next();
  });
};
