import { fail } from "../utils/response.js";

export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Error interno del servidor";
  const data = err.data || null;
  if (process.env.NODE_ENV !== "production") {
    // Evitar ruido de logs para 401/403 esperados (no autenticado)
    if (status !== 401 && status !== 403) {
      console.error("[ERROR]", { message, status, stack: err.stack });
    }
  }
  return fail(res, message, status, data);
};
