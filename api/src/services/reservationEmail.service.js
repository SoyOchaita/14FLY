import { renderTemplate } from "../utils/mailer.js";

function buildCta(appUrl, label) {
  if (!appUrl) return "";
  return `<p style="margin:16px 0 0"><a href="${appUrl}" style="display:inline-block;background:#f9b17a;color:#2d3250;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">${label}</a></p>`;
}

function currencyGTQ(value) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(value || 0));
}

export function buildReservationCreatedEmail({
  name,
  email,
  seatsList,
  rowsHtml,
  totalSeats,
  totalGroup,
  anyVip,
  becameVip,
  pendingForVip,
  appUrl
}) {
  const vipNote = anyVip
    ? '<p style="color:#16a34a;margin-top:6px">Descuento VIP (10%) aplicado en esta compra.</p>'
    : (becameVip
      ? '<p style="color:#93c5fd;margin-top:6px">¡Acabas de alcanzar estatus VIP! El 10% se aplicará en tus próximas reservas.</p>'
      : `<p style="color:#93c5fd;margin-top:6px">Aún no eres VIP. Te faltan <strong>${pendingForVip}</strong> reserva(s) para obtener 10% de descuento.</p>`);

  const contentHtml = `
    <h2 style="margin:0 0 8px;color:#fff">Reserva confirmada</h2>
    <p style="margin:0 0 8px">Hola <strong>${name || email}</strong>, gracias por reservar con 14FLY.</p>
    <p style="margin:0 0 8px"><strong>Asientos:</strong> ${seatsList}</p>
    <h3 style="margin:12px 0 6px;color:#fff;font-size:16px">Resumen</h3>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;min-width:360px">
      <thead style="background:rgba(255,255,255,.04)">
        <tr>
          <th style="text-align:left;padding:8px 12px">Clase</th>
          <th style="text-align:center;padding:8px 12px">Asientos</th>
          <th style="text-align:right;padding:8px 12px">Precio</th>
          <th style="text-align:right;padding:8px 12px">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:8px 12px;text-align:right;color:#93c5fd">Total (${totalSeats} asiento(s))</td>
          <td style="padding:8px 12px;text-align:right;font-weight:600">${currencyGTQ(totalGroup)}</td>
        </tr>
      </tfoot>
    </table>
    ${vipNote}
    ${buildCta(appUrl, "Ver mis reservas")}
    <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no realizaste esta compra, contáctanos de inmediato.</p>
  `;

  const html = renderTemplate({ title: "Reserva confirmada", intro: "Detalles de tu compra.", contentHtml });
  return {
    subject: "14FLY • Reserva confirmada",
    html,
    text: `Reserva confirmada: ${totalSeats} asiento(s). Total: Q${Number(totalGroup || 0).toFixed(2)}. Asientos: ${seatsList}`
  };
}

export function buildVipStatusEmail({ name, email, appUrl }) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;color:#fff">¡Felicidades, ${name || email}!</h2>
    <p style="margin:0 0 8px">Has alcanzado el nivel <strong>VIP</strong> en 14FLY.</p>
    <ul style="margin:8px 0 0;padding-left:18px;color:#c7d2fe">
      <li>10% de descuento en tus reservas.</li>
      <li>Atención prioritaria.</li>
      <li>Promociones exclusivas.</li>
    </ul>
    ${buildCta(appUrl, "Reservar ahora")}
  `;
  const html = renderTemplate({ title: "Estatus VIP", intro: "Beneficios VIP activados en tu cuenta", contentHtml });
  return {
    subject: "14FLY • ¡Eres VIP!",
    html,
    text: "Has alcanzado el nivel VIP en 14FLY. Disfruta 10% de descuento en tus reservas."
  };
}

export function buildReservationUpdatedEmail({
  name,
  email,
  changesTableRows,
  base,
  seatChanged,
  feeAdded,
  newFee,
  discount,
  total,
  discountAdded
}) {
  const changesTable = changesTableRows
    ? `
      <h3 style="margin:12px 0 6px;color:#fff;font-size:16px">Cambios</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
        <thead style="background:rgba(255,255,255,.04)">
          <tr>
            <th style="text-align:left;padding:8px 12px">Campo</th>
            <th style="text-align:left;padding:8px 12px">Antes</th>
            <th style="text-align:right;padding:8px 12px">Después</th>
          </tr>
        </thead>
        <tbody>
          ${changesTableRows}
        </tbody>
      </table>
    `
    : "";

  const breakdownTable = `
    <h3 style="margin:12px 0 6px;color:#fff;font-size:16px">Desglose de costos</h3>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
      <thead style="background:rgba(255,255,255,.04)">
        <tr>
          <th style="text-align:left;padding:8px 12px">Concepto</th>
          <th style="text-align:right;padding:8px 12px">Importe</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="padding:8px 12px;color:#93c5fd">Base</td><td style="padding:8px 12px;text-align:right">${currencyGTQ(base)}</td></tr>
        ${seatChanged ? `<tr><td style="padding:8px 12px;color:#93c5fd">Recargo por cambio (10%)</td><td style="padding:8px 12px;text-align:right">+ ${currencyGTQ(feeAdded)}</td></tr>` : ""}
        ${Number(newFee) > 0 ? `<tr><td style="padding:8px 12px;color:#93c5fd">Recargo acumulado</td><td style="padding:8px 12px;text-align:right">${currencyGTQ(newFee)}</td></tr>` : ""}
        ${discount > 0 ? `<tr><td style="padding:8px 12px;color:#93c5fd">Descuento VIP (10%)</td><td style="padding:8px 12px;text-align:right">- ${currencyGTQ(discount)}</td></tr>` : ""}
        <tr><td style="padding:8px 12px;color:#93c5fd;font-weight:600">Total</td><td style="padding:8px 12px;text-align:right;font-weight:600">${currencyGTQ(total)}</td></tr>
      </tbody>
    </table>
  `;

  const vipNote = discountAdded > 0
    ? '<p style="margin:8px 0 0;color:#16a34a">Se aplicó tu descuento VIP por primera vez.</p>'
    : (discount > 0 ? '<p style="margin:8px 0 0;color:#16a34a">Descuento VIP del 10% aplicado.</p>' : "");

  const contentHtml = `
    <h2 style="margin:0 0 8px;color:#fff">Tu reserva fue modificada</h2>
    <p style="margin:0 0 8px">Hola <strong>${name || email}</strong>, estos son los cambios aplicados a tu reserva:</p>
    ${changesTable}
    ${breakdownTable}
    ${vipNote}
    <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste esta modificación, contáctanos de inmediato.</p>
  `;

  const html = renderTemplate({ title: "Reserva modificada", intro: "Hemos actualizado tu reserva.", contentHtml });
  return {
    subject: "14FLY • Reserva modificada",
    html,
    text: `Tu reserva fue modificada. Total: ${currencyGTQ(total)}.`
  };
}

export function buildReservationCancelledEmail({ seatNumber, paxName, paxCui, reason, appUrl }) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;color:#fff">Reserva cancelada</h2>
    <p style="margin:0 0 8px">Se ha cancelado tu reserva del asiento <strong>${seatNumber}</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;min-width:320px">
      <thead style="background:rgba(255,255,255,.04)">
        <tr>
          <th style="text-align:left;padding:8px 12px">Campo</th>
          <th style="text-align:right;padding:8px 12px">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="padding:8px 12px;color:#93c5fd">Asiento</td><td style="padding:8px 12px;text-align:right">${seatNumber}</td></tr>
        <tr><td style="padding:8px 12px;color:#93c5fd">Pasajero</td><td style="padding:8px 12px;text-align:right">${paxName || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#93c5fd">CUI</td><td style="padding:8px 12px;text-align:right">${paxCui || "—"}</td></tr>
        ${reason ? `<tr><td style="padding:8px 12px;color:#93c5fd">Motivo</td><td style="padding:8px 12px;text-align:right">${reason}</td></tr>` : ""}
      </tbody>
    </table>
    ${buildCta(appUrl, "Ver mis reservas")}
    <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste esta cancelación, contáctanos de inmediato.</p>
  `;

  const html = renderTemplate({ title: "Reserva cancelada", intro: "Tu reserva ha sido cancelada.", contentHtml });
  return {
    subject: "14FLY • Reserva cancelada",
    html,
    text: `Se canceló tu reserva del asiento ${seatNumber}. Pasajero: ${paxName}. CUI: ${paxCui}.`
  };
}

export function buildBatchCancelledEmail({ reservationCount, seatsList, reason, appUrl }) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;color:#fff">Reservas canceladas</h2>
    <p style="margin:0 0 8px">Se han cancelado <strong>${reservationCount}</strong> reserva(s).</p>
    <p style="margin:0 0 8px"><strong>Asientos:</strong> ${seatsList}</p>
    ${reason ? `<p style="margin:0 0 8px"><strong>Motivo:</strong> ${reason}</p>` : ""}
    ${buildCta(appUrl, "Ver mis reservas")}
    <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px">Si no solicitaste estas cancelaciones, contáctanos de inmediato.</p>
  `;

  const html = renderTemplate({ title: "Reservas canceladas", intro: "Se ha cancelado un conjunto de reservas.", contentHtml });
  return {
    subject: "14FLY • Reservas canceladas",
    html,
    text: `Se han cancelado ${reservationCount} reservas. Asientos: ${seatsList}`
  };
}
