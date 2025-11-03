import { fail } from "../utils/response.js";

export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Error interno del servidor";
  const data = err.data || null;
  if (process.env.NODE_ENV !== "production") {
    console.error("[ERROR]", { message, status, stack: err.stack });
  }
  return fail(res, message, status, data);
};
