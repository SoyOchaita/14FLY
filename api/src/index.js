import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { pool } from "./db/pool.js";
import reportsRoutes from "./routes/reports.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import userRoutes from "./routes/users.routes.js";
import seatRoutes from "./routes/seats.routes.js";
import reservationRoutes from "./routes/reservations.routes.js";
import configRoutes from "./routes/config.routes.js";
import { getTransporter, sendMail, renderTemplate } from "./utils/mailer.js";

dotenv.config();

// =======================================
// CONFIGURACIÓN BASE
// =======================================
const app = express();
app.use(cors());
app.use(express.json());

// Utilidad local para escapar HTML en fragmentos dinámicos
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Resolver adjuntos (logo) si existe un path configurado
function getLogoAttachment() {
  const configuredPath = process.env.MAIL_LOGO_PATH ? String(process.env.MAIL_LOGO_PATH) : null;
  if (!configuredPath) return null;
  try {
    const absolute = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
    if (fs.existsSync(absolute)) {
      const filename = path.basename(absolute);
      return { filename, path: absolute, cid: 'logo' };
    }
  } catch (_) { /* ignore */ }
  return null;
}

// =======================================
// RUTAS
// =======================================
app.use("/api/users", userRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/config", configRoutes);

// Endpoints de salud
app.get("/", (req, res) => res.send("🛫 API 14FLY en ejecución"));
app.get("/health", (req, res) => res.json({ success: true, message: "ok", data: { timestamp: new Date().toISOString(), uptime: process.uptime() } }));
app.get("/health/email", async (req, res) => {
  const cfg = {
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false',
    hasAuth: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    from: process.env.MAIL_FROM || null
  };
  // Si no hay HOST definido, reportar como no configurado (200) para no romper despliegues
  if (!cfg.host) {
    return res.json({ success: true, message: "email: not-configured", data: { configured: false, ...cfg } });
  }
  try {
    const transporter = getTransporter();
    const ok = await transporter.verify();
    return res.json({ success: true, message: ok ? "email: ready" : "email: unknown", data: { configured: true, verified: !!ok, ...cfg } });
  } catch (e) {
    return res.status(503).json({ success: false, message: "email: verify-failed", data: { configured: true, error: e.message, ...cfg } });
  }
});

// Envío de prueba (solo no-producción). Útil para validar Mailtrap.
app.get("/health/email/test", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  try {
    const logoAtt = getLogoAttachment();
    const html = renderTemplate({
      title: 'Prueba SMTP 14FLY',
      intro: 'Este es un correo de prueba para validar la configuración SMTP.',
      contentHtml: '<p>Si estás usando Mailtrap, revisa tu inbox de Mailtrap.</p>',
      logoCid: logoAtt ? 'logo' : undefined
    });
    await sendMail({ to, subject: 'Prueba SMTP 14FLY', html, text: 'Correo de prueba SMTP 14FLY.', attachments: logoAtt ? [logoAtt] : undefined });
    return res.json({ success: true, message: 'email: test-sent', data: { to } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: test-failed', data: { to, error: e.message } });
  }
});

// =======================================
// ENDPOINTS DE PRUEBA DE PLANTILLAS DE EMAIL (solo no-producción)
// =======================================
app.get("/test/email/welcome", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  const name = String(req.query.name || 'Pasajero 14FLY');
  try {
    const logoAtt = getLogoAttachment();
    const contentHtml = `
      <h2 style="margin:0 0 8px;color:#fff">¡Bienvenido/a a 14FLY!</h2>
      <p style="margin:0 0 8px">Tu cuenta ha sido creada exitosamente.</p>
      <ul style="margin:8px 0 0;padding-left:18px;color:#c7d2fe">
        <li>Nombre: <strong>${escapeHtml(name)}</strong></li>
        <li>Correo: <strong>${escapeHtml(to)}</strong></li>
      </ul>
    `;
    const html = renderTemplate({
      title: 'Bienvenido a 14FLY',
      intro: `Hola ${escapeHtml(name)}, gracias por unirte a 14FLY`,
      contentHtml,
      logoCid: logoAtt ? 'logo' : undefined,
    });
    await sendMail({ to, subject: 'Bienvenido a 14FLY', html, text: 'Bienvenido a 14FLY. Tu cuenta fue creada.', attachments: logoAtt ? [logoAtt] : undefined });
    return res.json({ success: true, message: 'email: welcome-sent', data: { to } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: welcome-failed', data: { to, error: e.message } });
  }
});

app.get("/test/email/reservation-created", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  const name = String(req.query.name || 'Pasajero 14FLY');
  const vip = String(req.query.vip || 'true') === 'true';
  try {
    const logoAtt = getLogoAttachment();
    const seats = [
      { seat: '12B', clase: 'Económica', base: 500 },
      { seat: '1A', clase: 'Primera', base: 1200 }
    ];
    const subtotal = seats.reduce((s, x) => s + x.base, 0);
    const vipDiscount = vip ? Math.round(subtotal * 0.10 * 100) / 100 : 0;
    const total = Math.round((subtotal - vipDiscount) * 100) / 100;
    const currency = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);
    const rows = seats.map(x => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08)">${x.seat}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08)">${x.clase}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">${currency(x.base)}</td>
      </tr>
    `).join('');
    const contentHtml = `
      <h2 style="margin:0 0 8px;color:#fff">Reserva confirmada</h2>
      <p style="margin:0 0 8px">Gracias por reservar con 14FLY, ${escapeHtml(name)}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
        <thead style="background:rgba(255,255,255,.04)">
          <tr>
            <th style="text-align:left;padding:8px 12px">Asiento</th>
            <th style="text-align:left;padding:8px 12px">Clase</th>
            <th style="text-align:right;padding:8px 12px">Base</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:8px 12px;text-align:right;color:#93c5fd">Subtotal</td>
            <td style="padding:8px 12px;text-align:right">${currency(subtotal)}</td>
          </tr>
          ${vip ? `<tr><td colspan="2" style="padding:8px 12px;text-align:right;color:#93c5fd">Descuento VIP (10%)</td><td style="padding:8px 12px;text-align:right">- ${currency(vipDiscount)}</td></tr>` : ''}
          <tr>
            <td colspan="2" style="padding:8px 12px;text-align:right;color:#93c5fd;font-weight:600">Total</td>
            <td style="padding:8px 12px;text-align:right;font-weight:600">${currency(total)}</td>
          </tr>
        </tfoot>
      </table>
      ${vip ? `<p style="margin:12px 0 0;color:#93c5fd">Estatus VIP aplicado: 10% de descuento por fidelidad.</p>` : ''}
    `;
    const html = renderTemplate({ title: 'Reserva confirmada', intro: 'Detalles de tu reserva', contentHtml, logoCid: logoAtt ? 'logo' : undefined });
    await sendMail({ to, subject: '14FLY • Reserva confirmada', html, attachments: logoAtt ? [logoAtt] : undefined });
    return res.json({ success: true, message: 'email: reservation-created-sent', data: { to, vip } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: reservation-created-failed', data: { to, error: e.message } });
  }
});

app.get("/test/email/reservation-updated", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  const vip = String(req.query.vip || 'false') === 'true';
  try {
    const logoAtt = getLogoAttachment();
    const beforeSeat = '12B';
    const afterSeat = '14C';
    const base = 500;
    const changeFee = Math.round(base * 0.10 * 100) / 100;
    const vipDiscount = vip ? Math.round(base * 0.10 * 100) / 100 : 0;
    const total = Math.round((base + changeFee - vipDiscount) * 100) / 100;
    const currency = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);
    const contentHtml = `
      <h2 style="margin:0 0 8px;color:#fff">Tu reserva fue modificada</h2>
      <p style="margin:0 0 8px">Asiento anterior: <strong>${beforeSeat}</strong> → Nuevo asiento: <strong>${afterSeat}</strong></p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
        <tbody>
          <tr><td style="padding:8px 12px;color:#93c5fd">Base</td><td style="padding:8px 12px;text-align:right">${currency(base)}</td></tr>
          <tr><td style="padding:8px 12px;color:#93c5fd">Recargo por cambio (10%)</td><td style="padding:8px 12px;text-align:right">+ ${currency(changeFee)}</td></tr>
          ${vip ? `<tr><td style="padding:8px 12px;color:#93c5fd">Descuento VIP (10%)</td><td style="padding:8px 12px;text-align:right">- ${currency(vipDiscount)}</td></tr>` : ''}
          <tr><td style="padding:8px 12px;color:#93c5fd;font-weight:600">Total</td><td style="padding:8px 12px;text-align:right;font-weight:600">${currency(total)}</td></tr>
        </tbody>
      </table>
    `;
    const html = renderTemplate({ title: 'Reserva modificada', intro: 'Hemos actualizado tu reserva', contentHtml, logoCid: logoAtt ? 'logo' : undefined });
    await sendMail({ to, subject: '14FLY • Reserva modificada', html, attachments: logoAtt ? [logoAtt] : undefined });
    return res.json({ success: true, message: 'email: reservation-updated-sent', data: { to, vip } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: reservation-updated-failed', data: { to, error: e.message } });
  }
});

app.get("/test/email/reservation-cancelled", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  try {
    const logoAtt = getLogoAttachment();
    const seats = ['12B', '14C'];
    const contentHtml = `
      <h2 style="margin:0 0 8px;color:#fff">Cancelación de reserva</h2>
      <p style="margin:0 0 8px">Hemos cancelado la siguiente selección de asientos:</p>
      <p style="margin:0 0 8px"><strong>${seats.join(', ')}</strong></p>
      <p style="margin:0;color:#93c5fd">Si no solicitaste esta cancelación, contáctanos de inmediato.</p>
    `;
    const html = renderTemplate({ title: 'Reserva cancelada', intro: 'Tu reserva ha sido cancelada', contentHtml, logoCid: logoAtt ? 'logo' : undefined });
    await sendMail({ to, subject: '14FLY • Reserva cancelada', html, attachments: logoAtt ? [logoAtt] : undefined });
    return res.json({ success: true, message: 'email: reservation-cancelled-sent', data: { to } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: reservation-cancelled-failed', data: { to, error: e.message } });
  }
});

app.get("/test/email/vip", async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({ success: false, message: 'email: test-disabled-in-production' });
  }
  const to = String(req.query.to || 'test@14fly.local');
  const name = String(req.query.name || 'Pasajero 14FLY');
  try {
    const logoAtt = getLogoAttachment();
    const contentHtml = `
      <h2 style="margin:0 0 8px;color:#fff">¡Felicidades, ${escapeHtml(name)}!</h2>
      <p style="margin:0 0 8px">Has alcanzado el nivel <strong>VIP</strong> en 14FLY.</p>
      <ul style="margin:8px 0 0;padding-left:18px;color:#c7d2fe">
        <li>10% de descuento en tus reservas.</li>
        <li>Atención prioritaria.</li>
        <li>Promociones exclusivas.</li>
      </ul>
    `;
    const html = renderTemplate({ title: 'Estatus VIP', intro: 'Beneficios VIP activados en tu cuenta', contentHtml, logoCid: logoAtt ? 'logo' : undefined });
    await sendMail({ to, subject: '14FLY • ¡Eres VIP!', html, attachments: logoAtt ? [logoAtt] : undefined });
    return res.json({ success: true, message: 'email: vip-sent', data: { to } });
  } catch (e) {
    return res.status(503).json({ success: false, message: 'email: vip-failed', data: { to, error: e.message } });
  }
});

// =======================================
// VARIABLES DE ENTORNO
// =======================================
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "localhost";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || "flydb";
const ENV = process.env.NODE_ENV || "development";

// =======================================
// INICIO DEL SERVIDOR
// =======================================
app.listen(PORT, HOST, async () => {
  console.clear();

  // Intentar validar la conexión a PostgreSQL
  let dbStatus = chalk.red("❌ Error");
  try {
    await pool.query("SELECT 1");
    dbStatus = chalk.green("✅ Conectada");
  } catch (err) {
    console.error(chalk.red("Error de conexión a la base de datos:"), err.message);
  }

  // Detectar si corre en Docker
  const isDocker = process.env.DOCKER_ENV === "true";

  // =======================================
  // LOG ESTRUCTURADO DE ESTADO DEL SERVIDOR
  // =======================================
  console.log(chalk.bold.cyan("=============================================="));
  console.log(chalk.bold.green("🚀  SERVIDOR 14FLY EN EJECUCIÓN"));
  console.log(chalk.gray("----------------------------------------------"));
  console.log(`${chalk.white("🌐  URL:")} ${chalk.bold.blue(`http://${HOST}:${PORT}`)}`);
  console.log(`${chalk.white("🧭  Modo:")} ${ENV === "development" ? chalk.yellow("Desarrollo") : chalk.green("Producción")}`);
  console.log(`${chalk.white("🗄️  Base de datos:")} ${chalk.yellow(DB_NAME)} ${chalk.gray(`(${DB_HOST}:${DB_PORT})`)}`);
  console.log(`${chalk.white("🔌  Estado conexión DB:")} ${dbStatus}`);
  console.log(chalk.bold.cyan("=============================================="));
});

// Manejo centralizado de errores
app.use(errorHandler);
