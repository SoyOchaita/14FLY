import { validateCUI } from "../services/cui.service.js";
import { HttpError } from "../utils/response.js";

// Middleware opcional: si viene req.body.cui lo valida
export const validateCuiMiddleware = (req, res, next) => {
  const { cui } = req.body || {};
  if (cui === undefined || cui === null || cui === "") return next();
  if (!validateCUI(String(cui))) {
    return next(
      new HttpError(
        "CUI inválido. Estructura esperada: ####-#####-#### o 13 dígitos seguidos sin espacios. ",
        400
      )
    );
  }
  next();
};
