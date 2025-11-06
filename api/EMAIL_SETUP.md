# Configurar correo (SMTP) en 14FLY

Este proyecto usa `nodemailer` con una utilidad unificada (`src/utils/mailer.js`).

## Recomendado en desarrollo: Mailtrap

1. Crea una cuenta en https://mailtrap.io y genera un Inbox.
2. Copia las credenciales SMTP del Inbox (host, puerto, usuario, contraseña).
3. Edita `api/.env` y descomenta la sección **Opción A: Mailtrap**:

```
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<TU_USER>
SMTP_PASS=<TU_PASS>
MAIL_FROM="14FLY <no-reply@14fly.local>"
```

4. Reinicia la API y visita:
   - `GET /health/email` → Debe mostrar `email: ready` si todo está correcto.
   - `GET /health/email/test?to=demo@example.com` → Enviará un correo de prueba (en Mailtrap llegará a tu Inbox aunque el destinatario sea cualquiera).

## Gmail (requiere App Password)

- Habilita 2FA y crea un App Password.
- Usa 587 con STARTTLS (SECURE=false) o 465 con TLS implícito (SECURE=true).

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_app_password
MAIL_FROM="14FLY <tu_correo@gmail.com>"
```

## Outlook / Office 365

- Usa STARTTLS en el puerto 587 (SECURE=false).

```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@tu_dominio
SMTP_PASS=tu_password_o_app_password
MAIL_FROM="14FLY <tu_correo@tu_dominio>"
```

## Notas

- No subas credenciales reales al repositorio.
- En producción, considera un proveedor transaccional (SendGrid, Mailgun, Amazon SES) por reputación y métricas.
- Opcionalmente personaliza branding de plantillas con `MAIL_BRAND_NAME` y `MAIL_PRIMARY_COLOR`.
