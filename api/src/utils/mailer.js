import nodemailer from 'nodemailer';

let cachedTransporter = null;

export function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  cachedTransporter = transporter;
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || '14FLY <no-reply@14fly.local>';
  try {
    const info = await getTransporter().sendMail({ from, to, subject, html, text });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[mail] sent', subject, info.messageId);
    }
    return info;
  } catch (e) {
    console.warn('[mail] send failed:', e.message);
    throw e;
  }
}

export function renderTemplate({ title, intro, contentHtml, footerHtml }) {
  const brand = process.env.MAIL_BRAND_NAME || '14FLY';
  const primary = process.env.MAIL_PRIMARY_COLOR || '#60a5fa'; /* soft blue */
  const bg = '#0b1220';
  const card = '#111827';
  const text = '#c7d2fe';
  const soft = '#93c5fd';
  return `
  <!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(String(title || brand))}</title>
  </head>
  <body style="margin:0;padding:24px;background:${bg};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${text};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:${card};border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
      <tr>
        <td style="padding:20px 24px;background:${card}">
          <div style="font-size:18px;font-weight:700;color:#fff;letter-spacing:.4px">
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${primary};color:#0b1220;margin-right:8px">${brand.slice(0,5)}</span>${brand}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 24px;color:${soft};font-size:13px">${escapeHtml(String(intro || ''))}</td>
      </tr>
      <tr>
        <td style="padding:12px 24px">${contentHtml || ''}</td>
      </tr>
      ${footerHtml ? `<tr><td style="padding:16px 24px;color:${soft};font-size:12px;border-top:1px solid rgba(255,255,255,0.08)">${footerHtml}</td></tr>` : ''}
    </table>
    <div style="max-width:640px;margin:10px auto 0;text-align:center;color:${soft};opacity:.8;font-size:11px">Este mensaje fue enviado automáticamente. No respondas a este correo.</div>
  </body>
  </html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
