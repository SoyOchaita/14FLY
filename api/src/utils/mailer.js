import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

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

function resolveLogoAttachment() {
  const p = process.env.MAIL_LOGO_PATH ? String(process.env.MAIL_LOGO_PATH) : null;
  if (!p) return null;
  try {
    const absolute = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (fs.existsSync(absolute)) {
      return { filename: path.basename(absolute), path: absolute, cid: 'logo' };
    }
  } catch (_) { /* ignore */ }
  return null;
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const from = process.env.MAIL_FROM || '14FLY <no-reply@14fly.local>';
  try {
    let finalAttachments = attachments;
    if (!finalAttachments || finalAttachments.length === 0) {
      const logo = resolveLogoAttachment();
      if (logo) finalAttachments = [logo];
    } else {
      const hasLogo = finalAttachments.some(a => a && (a.cid === 'logo'));
      if (!hasLogo) {
        const logo = resolveLogoAttachment();
        if (logo) finalAttachments = [...finalAttachments, logo];
      }
    }
    const info = await getTransporter().sendMail({ from, to, subject, html, text, attachments: finalAttachments });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[mail] sent', subject, info.messageId);
    }
    return info;
  } catch (e) {
    console.warn('[mail] send failed:', e.message);
    throw e;
  }
}

export function renderTemplate({ title, intro, contentHtml, footerHtml, logoCid, logoUrl, logoHeight }) {
  // Marca y paleta basada en el frontend
  const brand = process.env.MAIL_BRAND_NAME || '14FLY';
  const accent = process.env.MAIL_ACCENT_COLOR || '#f9b17a';
  const dark = '#2d3250';
  const graphite = '#424769';
  const softblue = '#b7bfd9';

  const bgGradient = `linear-gradient(135deg, ${dark}, ${graphite})`;
  const cardBg = 'rgba(255,255,255,0.05)';
  const border = '1px solid rgba(255,255,255,0.10)';
  const shadow = '0 10px 30px rgba(0,0,0,0.25)';
  const text = softblue;
  const titleColor = '#ffffff';

  const hasLocalLogo = !!resolveLogoAttachment();
  const resolvedLogo = logoCid
    ? `cid:${logoCid}`
    : (hasLocalLogo ? 'cid:logo' : (logoUrl || process.env.MAIL_LOGO_URL || null));
  const resolvedLogoHeight = (() => {
    const envH = process.env.MAIL_LOGO_HEIGHT ? Number(process.env.MAIL_LOGO_HEIGHT) : undefined;
    const propH = logoHeight ? Number(logoHeight) : undefined;
    return (propH && !Number.isNaN(propH)) ? propH : ((envH && !Number.isNaN(envH)) ? envH : 40);
  })();

  return `
  <!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(String(title || brand))}</title>
  </head>
  <body style="margin:0;padding:24px;background:${dark};background-image:${bgGradient};font-family:Raleway, Segoe UI, Roboto, Helvetica, Arial, sans-serif;color:${text};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;margin:0 auto;background:${cardBg};border-radius:16px;overflow:hidden;border:${border};box-shadow:${shadow}">
      <tr>
        <td style="padding:16px 20px;background:rgba(0,0,0,0.20);border-bottom:${border}">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="vertical-align:middle">
                <div style="display:flex;align-items:center;gap:10px">
                  ${resolvedLogo ? `<img src="${resolvedLogo}" alt="${escapeHtml(brand)}" style="height:${resolvedLogoHeight}px;width:auto;display:inline-block;vertical-align:middle" />` : ''}
                  <span style="font-size:18px;font-weight:700;color:${titleColor};letter-spacing:.4px">${brand}</span>
                  <span style="display:inline-block;margin-left:8px;padding:4px 10px;border-radius:999px;background:${accent};color:${dark};font-weight:600;font-size:12px">Travel</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${intro ? `<tr><td style="padding:8px 24px;color:${text};opacity:.9;font-size:13px">${escapeHtml(String(intro))}</td></tr>` : ''}
      <tr>
        <td style="padding:16px 24px">${contentHtml || ''}</td>
      </tr>
      ${footerHtml ? `<tr><td style="padding:16px 24px;color:${text};opacity:.9;font-size:12px;border-top:${border}">${footerHtml}</td></tr>` : ''}
    </table>
    <div style="max-width:720px;margin:10px auto 0;text-align:center;color:${text};opacity:.7;font-size:11px">Este mensaje fue enviado automáticamente. No respondas a este correo.</div>
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
