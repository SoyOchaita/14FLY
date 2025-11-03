import { HttpError } from "./response.js";

function parseAllowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

function allowedDomainsForMessage() {
  const allowed = parseAllowedDomains();
  return allowed.length ? allowed.map((d) => `@${d}`).join(" | ") : "cualquier dominio válido";
}

function validateEmail(email) {
  if (!email) throw new HttpError("Email requerido.", 400);

  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    throw new HttpError(
      `Email inválido. Formato válido: nombre@dominio.tld. Dominios permitidos: ${allowedDomainsForMessage()}`,
      400
    );
  }

  const allowed = parseAllowedDomains();
  if (!allowed.length) return; // sin restricción

  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || !allowed.includes(domain)) {
    throw new HttpError(
      `Dominio de correo no permitido. Solo se aceptan: ${allowedDomainsForMessage()}`,
      400
    );
  }
}

export { validateEmail, parseAllowedDomains, allowedDomainsForMessage };
