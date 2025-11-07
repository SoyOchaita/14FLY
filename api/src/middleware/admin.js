import { HttpError } from "../utils/response.js";

function parseAdminEmails() {
  // Admite variables alternativas por si el entorno usa otra convención
  const sources = [
    process.env.ADMIN_EMAILS,
    process.env.ADMIN_EMAIL,
    process.env.ADMINS,
    process.env.ADMIN,
  ].filter(Boolean);
  const raw = sources.join(',');
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(req, _res, next) {
  try {
    if (!req.user || !req.user.email) throw new HttpError("No autenticado", 401);
    const admins = parseAdminEmails();
    const ok = admins.includes(String(req.user.email).toLowerCase());
    if (!ok) throw new HttpError("Requiere rol de administrador", 403);
    return next();
  } catch (err) {
    return next(err);
  }
}

export function currentUserIsAdmin(email) {
  const admins = parseAdminEmails();
  return admins.includes(String(email || '').toLowerCase());
}
