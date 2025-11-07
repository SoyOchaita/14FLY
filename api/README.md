# API 14FLY

Guía rápida para levantar y verificar la API localmente.

## Requisitos
- Node.js 18+ (probado con Node 22)
- npm
- (Opcional) PostgreSQL si vas a probar endpoints que consultan la BD

## Variables de entorno
Crea un archivo `.env` (opcional) si quieres configurar el puerto u opciones de BD:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=flydb
JWT_SECRET=supersecreto
```

Si no defines `PORT`, la API usa 3000 por defecto.

## Ejecutar en desarrollo

En PowerShell:

```powershell
cd "C:\UMES\VI SEMESTRE\Progra_web\Actividades\Proyecto-Final\14FLY\14FLY\api"
npm install
npm run dev
```

Deberías ver en la terminal:
- "✅ Conexión a PostgreSQL lista" (se crea el pool, la conexión real ocurre al primer query)
- "✅ API corriendo en puerto 3000"

## Verificar que está corriendo

- Navegador: abre http://localhost:3000/
  - Respuesta esperada: `🛫 API 14FLY en ejecución`

- PowerShell:

```powershell
# Probar que el puerto está escuchando
Test-NetConnection -ComputerName localhost -Port 3000

# Obtener el contenido de la ruta raíz
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/).Content
```

## Rutas principales
- `GET /` -> texto simple confirmando que la API está en ejecución
- `GET /api/seats` -> requiere BD; devuelve asientos
- `POST /api/users/register` -> registro
- `POST /api/users/login` -> login (devuelve JWT)
- `POST /api/reservations` (con Bearer token)
- `GET /api/reservations/me` (con Bearer token)

## Pruebas de Email (solo no-producción)
Estas rutas ayudan a validar el estilo y contenido de los correos sin depender de acciones reales. Se deshabilitan automáticamente cuando `NODE_ENV=production`.

- `GET /health/email` → Verifica la conectividad del SMTP (no envía correo).
- `GET /health/email/test?to=tu_correo@example.com` → Envía un correo simple de prueba.
- `GET /test/email/welcome?to=tu_correo@example.com&name=Tu%20Nombre`
  - Prueba el correo de bienvenida/creación de usuario.
- `GET /test/email/reservation-created?to=tu_correo@example.com&name=Tu%20Nombre&vip=true|false`
  - Prueba el correo de reserva creada, con tabla de asientos y descuento VIP opcional.
- `GET /test/email/reservation-updated?to=tu_correo@example.com&vip=true|false`
  - Prueba el correo de modificación de reserva, mostrando recargo de cambio (10%) y descuento VIP.
- `GET /test/email/reservation-cancelled?to=tu_correo@example.com`
  - Prueba el correo de cancelación.
- `GET /test/email/vip?to=tu_correo@example.com&name=Tu%20Nombre`
  - Prueba el correo de notificación de estatus VIP.

Notas:
- Configura SMTP en `api/.env` (por ejemplo Gmail con App Password) y reinicia la API.
- Con Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=tu_gmail`, `SMTP_PASS=app_password_sin_espacios`, `MAIL_FROM="14FLY <tu_gmail>"`.
 - Logo en correos:
   - Coloca tu imagen en `api/assets/` y define `MAIL_LOGO_PATH=assets/logo-14fly.png`.
   - O usa `MAIL_LOGO_URL=https://tu-dominio/logo-14fly.png`.
   - El header del email usará el logo si está disponible.
  - Tamaño opcional del logo: `MAIL_LOGO_HEIGHT=40` (en píxeles)

## Solución de problemas
- El navegador no carga:
  - Asegúrate de usar "localhost" (con "o"): http://localhost:3000/
  - Verifica que la terminal donde corriste `npm run dev` muestra "API corriendo en puerto 3000" y no errores.
  - Prueba el puerto: `Test-NetConnection -ComputerName localhost -Port 3000`
- Error EADDRINUSE (puerto en uso):
  - Cambia el puerto en `.env`, por ejemplo `PORT=3001`, reinicia `npm run dev` y visita http://localhost:3001/
- Error de conexión a BD:
  - Ajusta variables de entorno de PostgreSQL en `.env` y asegúrate de que el servidor de BD esté activo.
- Cambios no se reflejan:
  - Nodemon reinicia automáticamente; si no, presiona `rs` en la consola de nodemon o detén y vuelve a iniciar.

## Producción

```powershell
npm run start
```

Esto levanta `node src/index.js` sin reinicio automático.